import AppKit
import Foundation
import UserNotifications

/// Owned by AppDelegate. Receives messages from the webpage but leaves
/// presentation/sound to macOS UserNotifications (rather than web audio).
final class NativeNotificationCoordinator {
    private var deduplicator = NotificationDeduplicator()
    private(set) var sameSourceDuplicates = 0
    private(set) var crossSourceDuplicates = 0
    private(set) var focusReplays = 0
    private(set) var lastPreviewRepeats = 0
    private(set) var genericStatusSuppressed = 0
    private(set) var webSubmitted = 0
    private(set) var webEventsWithoutThread = 0
    private(set) var webSubmittedWithoutThread = 0
    private(set) var domSubmitted = 0
    private(set) var threadCardsReplaced = 0
    private var richPreviewByThread: [String: Date] = [:]
    private var knownThreadCards: Set<String> = []

    func didResignActive() {
        deduplicator.didResignActive()
    }

    func didBecomeActive() {
        deduplicator.didBecomeActive()
    }
    private(set) var received = 0
    private(set) var submitted = 0
    private(set) var suppressed = 0
    private(set) var errors = 0
    private(set) var cleanedUnreadLabels = 0
    private(set) var lastSource = "none"
    private(set) var lastSubmissionError = "none"

    // Never keep WKWebView instances in this coordinator. Navigation is
    // persisted in UNNotificationContent.userInfo and still works after reloads.
    private func conversationPath(_ raw: String) -> String? {
        if raw.hasPrefix("/t/") {
            guard let value = URL(string: "https://www.messenger.com" + raw),
                  value.path.hasPrefix("/t/") else { return nil }
            return value.path
        }
        guard let url = URL(string: raw), url.scheme == "https",
              let host = url.host?.lowercased(),
              host == "messenger.com" || host == "www.messenger.com",
              url.path.hasPrefix("/t/") else { return nil }
        return url.path
    }

    func deliver(_ payload: [String: Any]) {
        guard let id = payload["id"] as? String,
              !id.isEmpty, id.count < 160 else { return }

        received += 1
        let source = (payload["nguon"] as? String) ?? "web"
        let prepared = NotificationPreviewFormatter.format(
            title: payload["tieuDe"] as? String ?? "Messenger",
            subtitle: payload["phuDe"] as? String ?? "",
            body: payload["noiDung"] as? String ?? "Tin nhắn mới"
        )
        let title = String(prepared.title.prefix(150))
        let subtitle = String(prepared.subtitle.prefix(100))
        let body = String(prepared.body.prefix(1000))
        lastSource = source
        if prepared.removedUnreadLabel {
            cleanedUnreadLabels += 1
            NSLog("MN NOTI: unread-status UI label removed (source: %@)", source)
        }
        let rawThread = payload["duongDan"] as? String ?? payload["tag"] as? String ?? ""
        let path = conversationPath(rawThread)
        if source == "web" && path == nil {
            // This Web Notification event has no validated /t/<thread>.
            // Do not invent a thread identity from a display name:
            // different people or groups can share the same name.
            webEventsWithoutThread += 1
        }
        let genericStatus = NotificationDisplayPolicy.isGenericStatus(body)

        // Generic Web status such as "Unread message:" is not a message
        // preview. If a richer message notification for this exact chat was
        // just submitted, do not replace it with a placeholder.
        if source != "test", let path, genericStatus,
           let richAt = richPreviewByThread[path],
           Date().timeIntervalSince(richAt) >= 0,
           Date().timeIntervalSince(richAt) < 90 {
            genericStatusSuppressed += 1
            suppressed += 1
            NSLog("MN NOTI: generic status after rich chat preview suppressed")
            return
        }

        // De-duplicate at the shared Swift boundary, not only in one JS
        // source: same-source replays and cross-source web/DOM overlap.
        // A background notification may be replayed when WKWebView regains
        // focus many minutes later; remember only the previous background
        // session and suppress its exact content during the focus transition.
        // Test notifications intentionally bypass dedup.
        if source != "test" {
            let key = (path ?? rawThread) + "\u{001f}" + title + "\u{001f}" + body
            switch deduplicator.evaluate(key: key, source: source) {
            case .deliver:
                break
            case .duplicateSameSource:
                suppressed += 1
                sameSourceDuplicates += 1
                NSLog("MN NOTI: immediate same-source repeat suppressed")
                return
            case .duplicateCrossSource:
                suppressed += 1
                crossSourceDuplicates += 1
                NSLog("MN NOTI: cross-source duplicate suppressed")
                return
            case .duplicateOnFocus:
                suppressed += 1
                focusReplays += 1
                NSLog("MN NOTI: old background notification replayed on focus; suppressed")
                return
            case .duplicateLastPreview:
                suppressed += 1
                lastPreviewRepeats += 1
                NSLog("MN NOTI: same last chat preview redisplayed; suppressed")
                return
            }
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.subtitle = subtitle
        content.body = body
        content.sound = .default
        content.interruptionLevel = .active
        if let path {
            content.threadIdentifier = path
            content.userInfo = ["mnConversationPath": path]
        }

        // A stable request ID for each known conversation replaces the
        // previous Notification Center card; a different message can still
        // display a fresh banner. Unlike unique random IDs, this avoids a
        // long stack of cards from the same chat. Unknown web event routes
        // retain their original IDs instead of merging unrelated threads.
        // Test notifications must always have unique IDs.
        let requestID = source == "test"
            ? id : NotificationDisplayPolicy.requestIdentifier(path: path, originalID: id)
        if source != "test", let path {
            if knownThreadCards.contains(path) {
                threadCardsReplaced += 1
            }
            knownThreadCards.insert(path)
            if !genericStatus {
                richPreviewByThread[path] = Date()
            }
            richPreviewByThread = richPreviewByThread.filter {
                Date().timeIntervalSince($0.value) < 5 * 60
            }
            if richPreviewByThread.count > 75 {
                richPreviewByThread.removeAll(keepingCapacity: true)
            }
            if knownThreadCards.count > 250 {
                knownThreadCards.removeAll(keepingCapacity: true)
                knownThreadCards.insert(path)
            }
        }

        let request = UNNotificationRequest(identifier: requestID, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { [weak self] error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let error {
                    self.errors += 1
                    let info = error as NSError
                    self.lastSubmissionError = "\(info.domain) code \(info.code): \(error.localizedDescription)"
                    NSLog("MN NOTI: submission failed: %@", self.lastSubmissionError)
                } else {
                    self.submitted += 1
                    if source == "dom" { self.domSubmitted += 1 }
                    if source == "web" {
                        self.webSubmitted += 1
                        if path == nil { self.webSubmittedWithoutThread += 1 }
                    }
                    NSLog("MN NOTI: submitted source %@ to macOS (not proof of banner display)", source)
                }
            }
        }
    }

    func sendTest() {
        deliver([
            "id": "mn-test-" + UUID().uuidString,
            "tieuDe": "Messenger Native — thử thông báo",
            "phuDe": "Kiểm tra macOS",
            "noiDung": "Nếu banner hiện, quyền thông báo và đường gửi native đang hoạt động.",
            "nguon": "test"
        ])
    }

    var status: String {
        "Received: \(received) | Submitted: \(submitted) | Duplicates: \(suppressed) | Same-source: \(sameSourceDuplicates) | Cross-source: \(crossSourceDuplicates) | Focus replays: \(focusReplays) | Last-preview repeats: \(lastPreviewRepeats) | Generic suppressed: \(genericStatusSuppressed) | Thread cards replaced: \(threadCardsReplaced) | DOM submitted: \(domSubmitted) | Web submitted: \(webSubmitted) | Web no-thread received: \(webEventsWithoutThread) | Web no-thread submitted: \(webSubmittedWithoutThread) | Errors: \(errors) | Unread labels removed: \(cleanedUnreadLabels) | Last source: \(lastSource)\nLast submission error: \(lastSubmissionError)"
    }
}

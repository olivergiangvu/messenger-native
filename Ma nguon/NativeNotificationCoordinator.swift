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

        let request = UNNotificationRequest(identifier: id, content: content, trigger: nil)
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
                    NSLog("MN NOTI: submitted to macOS (not proof of banner display)")
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
        "Received: \(received) | Submitted: \(submitted) | Duplicates: \(suppressed) | Same-source: \(sameSourceDuplicates) | Cross-source: \(crossSourceDuplicates) | Focus replays: \(focusReplays) | Last-preview repeats: \(lastPreviewRepeats) | Errors: \(errors) | Unread labels removed: \(cleanedUnreadLabels) | Last source: \(lastSource)\nLast submission error: \(lastSubmissionError)"
    }
}

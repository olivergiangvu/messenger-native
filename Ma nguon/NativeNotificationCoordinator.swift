import AppKit
import Foundation
import UserNotifications

/// Owned by AppDelegate. Receives messages from the webpage but leaves
/// presentation/sound to macOS UserNotifications (rather than web audio).
final class NativeNotificationCoordinator {
    private struct Previous {
        let timestamp: Date
        let source: String
    }
    private var recentlySent: [String: Previous] = [:]
    private(set) var received = 0
    private(set) var submitted = 0
    private(set) var suppressed = 0
    private(set) var errors = 0
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
        let title = String((payload["tieuDe"] as? String ?? "Messenger").prefix(150))
        let subtitle = String((payload["phuDe"] as? String ?? "").prefix(100))
        let body = String((payload["noiDung"] as? String ?? "Tin nhắn mới").prefix(1000))
        let rawThread = payload["duongDan"] as? String ?? payload["tag"] as? String ?? ""
        let path = conversationPath(rawThread)

        // Suppress duplicates when Messenger's native Notification API and
        // DOM fallback independently report the same preview in quick succession.
        // Do NOT collapse repeated messages coming from the same source.
        let key = (path ?? rawThread) + "\u{001f}" + title + "\u{001f}" + body
        let now = Date()
        recentlySent = recentlySent.filter { now.timeIntervalSince($0.value.timestamp) < 30 }
        if let prior = recentlySent[key],
           prior.source != source,
           now.timeIntervalSince(prior.timestamp) < 8 {
            suppressed += 1
            NSLog("MN NOTI: cross-source duplicate suppressed")
            return
        }
        recentlySent[key] = Previous(timestamp: now, source: source)
        if recentlySent.count > 250 { recentlySent.removeAll(keepingCapacity: true) }

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
        "Received: \(received) | Submitted: \(submitted) | Duplicates: \(suppressed) | Errors: \(errors)\nLast submission error: \(lastSubmissionError)"
    }
}

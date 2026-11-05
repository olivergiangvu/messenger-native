import Foundation

/// Presentation-only policy; event detection and notification tap routing
/// remain unchanged. macOS uses the request identifier to replace a previous
/// delivered card when a newer message from the same conversation arrives.
enum NotificationDisplayPolicy {
    static func requestIdentifier(path: String?, originalID: String) -> String {
        guard let path, path.hasPrefix("/t/"), path.count < 140 else {
            return originalID
        }
        return "mn-chat:" + path
    }

    static func isGenericStatus(_ body: String) -> Bool {
        let normalized = body.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"[[:space:]]+"#, with: " ",
                                   options: .regularExpression)
            .lowercased()
        return [
            "unread message", "unread message:", "unread messages",
            "unread messages:", "tin nhắn chưa đọc", "tin nhắn chưa đọc:",
            "tin nhắn mới", "new message", "new message:"
        ].contains(normalized)
    }
}

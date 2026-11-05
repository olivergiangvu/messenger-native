import Foundation

/// Presentation-only policy; event detection and tap routing stay unchanged.
/// Keep each accepted incoming event's unique ID so Notification Center can
/// retain history. Grouping uses threadIdentifier, not a shared request ID.
enum NotificationDisplayPolicy {
    static func requestIdentifier(path: String?, originalID: String) -> String {
        // DOM and intercepted Web notification engines already generate
        // unique IDs for accepted events. Keep them to preserve history.
        // Existing deduplication removes false events before this step.
        return originalID
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

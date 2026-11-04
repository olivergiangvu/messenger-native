import Foundation

/// Cleans Messenger's accessibility/unread UI marker at the final boundary
/// shared by both the DOM fallback and intercepted web Notification API.
/// This does NOT alter unread detection, chat content, or stored messages.
enum NotificationPreviewFormatter {
    struct Result {
        let title: String
        let subtitle: String
        let body: String
        let removedUnreadLabel: Bool
    }

    private static let bareBadge = try! NSRegularExpression(
        pattern: #"^(?:(?:\d+)\s+)?(?:unread\s+messages?|tin\s+nhắn\s+chưa\s+đọc)$"#,
        options: [.caseInsensitive]
    )
    private static let badgeWithContent = try! NSRegularExpression(
        pattern: #"^(?:(?:\d+)\s+)?(?:unread\s+messages?|tin\s+nhắn\s+chưa\s+đọc)\s*[:·•|—–-]\s*(\S.*)$"#,
        options: [.caseInsensitive]
    )

    private static func match(_ pattern: NSRegularExpression, _ text: String) -> NSTextCheckingResult? {
        pattern.firstMatch(in: text, range: NSRange(text.startIndex..<text.endIndex, in: text))
    }

    private static func strip(_ input: String, allowEmpty: Bool) -> (text: String, removed: Bool) {
        let lines = input.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !lines.isEmpty else { return (input, false) }

        var remaining = lines
        var removed = false
        // Only inspect the leading header/status position, not text inside
        // a genuine message further down.
        for _ in 0..<2 {
            guard let first = remaining.first else { break }
            if match(bareBadge, first) != nil {
                guard remaining.count > 1 || allowEmpty else { break }
                remaining.removeFirst()
                removed = true
                continue
            }
            if let m = match(badgeWithContent, first),
               m.numberOfRanges > 1,
               let range = Range(m.range(at: 1), in: first) {
                remaining[0] = String(first[range])
                removed = true
            }
            break
        }
        return (removed ? remaining.joined(separator: "\n") : input, removed)
    }

    static func format(title: String, subtitle: String, body: String) -> Result {
        let t = strip(title, allowEmpty: true)
        let s = strip(subtitle, allowEmpty: true)
        // An entire message can literally be "Unread message". Preserve it.
        let b = strip(body, allowEmpty: false)

        return Result(
            title: t.text.isEmpty ? "Messenger" : t.text,
            subtitle: s.text,
            body: b.text,
            removedUnreadLabel: t.removed || s.removed || b.removed
        )
    }
}

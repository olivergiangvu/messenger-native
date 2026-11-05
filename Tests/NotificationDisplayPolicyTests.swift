import Foundation

@main
struct NotificationDisplayPolicyTests {
    static func main() {
        let a = NotificationDisplayPolicy.requestIdentifier(
            path: "/t/123456789", originalID: "mn-random-1")
        let b = NotificationDisplayPolicy.requestIdentifier(
            path: "/t/123456789", originalID: "mn-random-2")
        let other = NotificationDisplayPolicy.requestIdentifier(
            path: "/t/987654321", originalID: "mn-random-3")

        assert(a == b, "New messages in one chat must replace its previous Notification Center card")
        assert(a != other, "Different conversations must retain distinct cards")
        assert(a == "mn-chat:/t/123456789")
        assert(NotificationDisplayPolicy.requestIdentifier(path: nil,
            originalID: "web-event-1") == "web-event-1")
        assert(NotificationDisplayPolicy.requestIdentifier(path: "/invalid",
            originalID: "web-event-2") == "web-event-2")

        for generic in ["Unread message:", "Unread message", "Unread messages",
                        "Tin nhắn mới", "tin nhắn chưa đọc:", "New message"] {
            assert(NotificationDisplayPolicy.isGenericStatus(generic),
                   "Generic UI state not recognized: \(generic)")
        }
        for real in ["Dạ", "Hiệu khác được k ạ", "😂", "Unread message is my subject",
                     "Tin nhắn mới của tôi", "I sent a new message"] {
            assert(!NotificationDisplayPolicy.isGenericStatus(real),
                   "Real message must not be labelled generic: \(real)")
        }
        print("Notification display policy passed: stable per-thread cards, generic placeholder recognition")
    }
}

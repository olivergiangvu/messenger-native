import Foundation

@main
struct NotificationPreviewFormatterTests {
    static func main() {
        func preview(_ title: String, _ subtitle: String = "", _ body: String) -> NotificationPreviewFormatter.Result {
            NotificationPreviewFormatter.format(title: title, subtitle: subtitle, body: body)
        }

        let fromDOM = preview("Unread message\nNguyễn A", "Unread message", "Unread message\nHẹn gặp lúc 3 giờ nhé")
        assert(fromDOM.title == "Nguyễn A")
        assert(fromDOM.subtitle.isEmpty)
        assert(fromDOM.body == "Hẹn gặp lúc 3 giờ nhé")
        assert(fromDOM.removedUnreadLabel)

        let fromWeb = preview("Unread message · Linh", "", "Unread message: See you soon")
        assert(fromWeb.title == "Linh")
        assert(fromWeb.body == "See you soon")
        assert(fromWeb.removedUnreadLabel)

        let numbered = preview("2 unread messages\nProject team", "", "2 tin nhắn chưa đọc\nNew document")
        assert(numbered.title == "Project team")
        assert(numbered.body == "New document")

        let titleOnly = preview("Unread message", "", "New message content")
        assert(titleOnly.title == "Messenger")
        assert(titleOnly.body == "New message content")

        let literalMessage = preview("Alice", "", "Unread message")
        assert(literalMessage.body == "Unread message")
        assert(!literalMessage.removedUnreadLabel)

        let literalSentence = preview("Alice", "", "My unread message needs attention")
        assert(literalSentence.body == "My unread message needs attention")
        assert(!literalSentence.removedUnreadLabel)

        let noChanges = preview("Bob", "Robert", "Hello world")
        assert(noChanges.title == "Bob" && noChanges.subtitle == "Robert")
        assert(noChanges.body == "Hello world" && !noChanges.removedUnreadLabel)

        let middleNotHeader = preview("Conversation", "", "Hello\nUnread message\nFollow-up")
        assert(middleNotHeader.body == "Hello\nUnread message\nFollow-up")
        assert(!middleNotHeader.removedUnreadLabel)

        print("Native notification preview formatter tests passed")
    }
}

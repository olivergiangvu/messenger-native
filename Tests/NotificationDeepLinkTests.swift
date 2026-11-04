import Foundation

@main
struct NotificationDeepLinkTests {
    static func main() {
        let expected = "https://www.messenger.com/t/123456789"
        assert(NotificationDeepLink.url(forPath: "/t/123456789")?.absoluteString == expected)
        assert(NotificationDeepLink.url(forPath: "/t/group.abc")?.path == "/t/group.abc")
        assert(NotificationDeepLink.url(forPath: "/t/123456789/")?.path == "/t/123456789/")

        // Reject navigation targets that did not originate from a Messenger
        // conversation. Never create an external or script URL from a banner.
        for bad in ["", "/", "/","/t/", "/t/..", "/t/../../evil",
                    "/settings", "/t/123?next=https://example.com",
                    "/t/123#fragment", "//example.com/t/123",
                    "https://evil.example/t/123", "/t/123\\other",
                    "/t/123\nnext"] {
            assert(NotificationDeepLink.url(forPath: bad) == nil,
                   "Should reject unsafe notification path: \(bad)")
        }
        print("Notification deep-link tests passed")
    }
}

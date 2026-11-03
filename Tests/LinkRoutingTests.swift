import Foundation

@main
struct LinkRoutingTests {
    static func main() {
        func url(_ value: String) -> URL { URL(string: value)! }

        assert(LinkRouting.isReel(url("https://www.facebook.com/reel/1234567")))
        assert(!LinkRouting.isReel(url("https://www.facebook.com/alice/posts/1234567")))
        assert(LinkRouting.openInBrowser(url("https://www.facebook.com/alice/posts/123"),
                                         userActivated: true, newWindow: false))
        assert(LinkRouting.openInBrowser(url("https://www.facebook.com/reel/123"),
                                         userActivated: true, newWindow: true))
        assert(!LinkRouting.openInBrowser(url("https://www.facebook.com/login.php"),
                                          userActivated: true, newWindow: true))
        assert(!LinkRouting.openInBrowser(url("https://www.messenger.com/t/1234"),
                                          userActivated: true, newWindow: false))
        assert(!LinkRouting.openInBrowser(url("about:blank"),
                                          userActivated: false, newWindow: true))
        assert(!LinkRouting.openInBrowser(url("https://scontent.xx.fbcdn.net/file.jpg"),
                                          userActivated: false, newWindow: true))
        assert(LinkRouting.openInBrowser(url("https://example.org/article"),
                                         userActivated: true, newWindow: true))
        print("LinkRouting tests passed")
    }
}

import Foundation

@main
struct LinkRoutingTests {
    static func main() {
        func url(_ value: String) -> URL { URL(string: value)! }

        assert(LinkRouting.isReel(url("https://www.facebook.com/reel/1234567")))
        // Exact field reports from the user on 2026-11-03.
        assert(LinkRouting.canonicalReel(url("https://www.facebook.com/reel/2043484703034878"))?.absoluteString
               == "https://www.facebook.com/reel/2043484703034878/")
        assert(LinkRouting.canonicalReel(url("https://www.facebook.com/reel/1989333375359780/?fs=e&rdid=u1fiTtDcKAf1cMtb&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fv%2F1BJfeHChG4%2F"))?.absoluteString
               == "https://www.facebook.com/reel/1989333375359780/")
        assert(LinkRouting.canonicalReel(url("https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Freel%2F2043484703034878"))?.absoluteString
               == "https://www.facebook.com/reel/2043484703034878/")
        assert(LinkRouting.canonicalReel(url("https://www.facebook.com/alice/posts/1234567")) == nil)
        assert(!LinkRouting.isReel(url("https://www.facebook.com/alice/posts/1234567")))
        // Native Messenger already renders some share/v previews inline; do not
        // classify or re-route them as numeric Reels.
        assert(!LinkRouting.isReel(url("https://www.facebook.com/share/v/1JEMeWpjVL/")))
        // Reels and Facebook video shares must always open in the default
        // browser. Opaque share IDs are NOT numeric Reel IDs, so preserve
        // their URLs rather than trying to embed or fabricate an identifier.
        assert(LinkRouting.externalFacebookVideoURL(url("https://www.facebook.com/reel/12345"))?.absoluteString
               == "https://www.facebook.com/reel/12345/")
        assert(LinkRouting.externalFacebookVideoURL(url("https://m.facebook.com/reels/65432/?x=1"))?.absoluteString
               == "https://www.facebook.com/reel/65432/")
        assert(LinkRouting.externalFacebookVideoURL(url("https://www.facebook.com/share/r/Abc_123/"))?.absoluteString
               == "https://www.facebook.com/share/r/Abc_123/")
        assert(LinkRouting.externalFacebookVideoURL(url("https://m.facebook.com/share/v/Opaque_9/")) != nil)
        assert(LinkRouting.externalFacebookVideoURL(url("https://fb.watch/Abc_1234/")) != nil)
        assert(LinkRouting.externalFacebookVideoURL(url("https://www.facebook.com/watch/?v=12345")) != nil)
        assert(LinkRouting.externalFacebookVideoURL(url("https://www.facebook.com/alice/videos/12345/")) != nil)
        assert(LinkRouting.externalFacebookVideoURL(url("https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2Freel%2F12345"))?.absoluteString
               == "https://www.facebook.com/reel/12345/")
        assert(LinkRouting.externalFacebookVideoURL(url("https://www.facebook.com/alice/posts/123")) == nil)
        assert(LinkRouting.externalFacebookVideoURL(url("https://evil.example/reel/123")) == nil)
        assert(LinkRouting.externalFacebookVideoURL(url("https://www.messenger.com/t/123")) == nil)
        assert(LinkRouting.externalFacebookVideoURL(url("https://www.facebook.com/login.php")) == nil)
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
        print("LinkRouting tests passed: browser-only Reels, Facebook share/watch links and protected auth routes")
    }
}

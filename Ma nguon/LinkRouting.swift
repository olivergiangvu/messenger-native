import Foundation

/// Main-frame routing policy. The Reel thumbnail enhancement runs inside the
/// original Messenger WKWebView; navigation to Reel pages is still external.
enum LinkRouting {
    private static func matches(_ host: String, domain: String) -> Bool {
        host == domain || host.hasSuffix("." + domain)
    }

    private static func isFacebook(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return matches(host, domain: "facebook.com") || matches(host, domain: "fb.com")
    }

    private static func isMessenger(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return matches(host, domain: "messenger.com")
    }

    private static func isMediaHost(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return matches(host, domain: "fbcdn.net") || matches(host, domain: "fbsbx.com")
    }

    static func isReel(_ url: URL) -> Bool {
        guard isFacebook(url) else { return false }
        let components = url.path.lowercased().split(separator: "/")
        guard let first = components.first else { return false }
        return (first == "reel" || first == "reels") && components.count >= 2
    }

    private static func isAuthentication(_ url: URL) -> Bool {
        guard isFacebook(url) else { return false }
        let path = url.path.lowercased()
        return path == "/login" || path.hasPrefix("/login/") ||
            path == "/login.php" || path.hasPrefix("/checkpoint") ||
            path.hasPrefix("/two_step_verification") ||
            path.hasPrefix("/recover") || path.hasPrefix("/dialog/oauth") ||
            path.hasPrefix("/v2.0/dialog/oauth")
    }

    /// Only call for main-frame navigations; embedded video frames remain in WebKit.
    static func openInBrowser(_ url: URL, userActivated: Bool, newWindow: Bool) -> Bool {
        guard let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              url.host != nil else { return false }

        if isMessenger(url) || isMediaHost(url) { return false }
        if isFacebook(url) {
            if isAuthentication(url) { return false }
            // Post, profile and Reel links open externally; an inline Reel
            // thumbnail click is intercepted by reel-preview.js beforehand.
            return userActivated || newWindow
        }
        return true
    }
}

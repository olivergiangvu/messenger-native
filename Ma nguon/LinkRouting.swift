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

    /// Normalize both ordinary and tracked Facebook Reel links.
    /// Restrict IDs to digits: this must not misclassify a Facebook post or login.
    static func canonicalReel(_ url: URL) -> URL? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
        guard let host = url.host?.lowercased() else { return nil }

        if host == "l.facebook.com" || host == "l.messenger.com" {
            guard let target = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "u" })?.value,
                  let destination = URL(string: target) else { return nil }
            return canonicalReelDestination(destination)
        }
        return canonicalReelDestination(url)
    }

    private static func canonicalReelDestination(_ url: URL) -> URL? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
        guard let host = url.host?.lowercased(),
              ["facebook.com", "www.facebook.com", "m.facebook.com"].contains(host) else { return nil }
        let parts = url.path.split(separator: "/")
        guard parts.count >= 2, parts[0].lowercased() == "reel" || parts[0].lowercased() == "reels" else { return nil }
        let identifier = String(parts[1])
        guard !identifier.isEmpty, identifier.utf8.allSatisfy({ $0 >= 48 && $0 <= 57 }) else { return nil }
        return URL(string: "https://www.facebook.com/reel/\(identifier)/")
    }

    static func isReel(_ url: URL) -> Bool {
        canonicalReel(url) != nil
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

import Foundation

/// Converts only our own Messenger conversation paths into safe, first-party
/// navigation URLs. macOS notification taps must not depend on a synthetic
/// DOM click inside a backgrounded WebKit/React page.
enum NotificationDeepLink {
    static func url(forPath raw: String) -> URL? {
        guard raw.hasPrefix("/t/"),
              !raw.contains("?"), !raw.contains("#"),
              !raw.contains("\\"),
              !raw.contains(where: { $0.isNewline || $0.isWhitespace }),
              let components = URLComponents(string: "https://www.messenger.com" + raw),
              components.scheme == "https",
              components.host == "www.messenger.com",
              components.query == nil,
              components.fragment == nil else { return nil }

        let sections = components.percentEncodedPath.split(separator: "/", omittingEmptySubsequences: true)
        guard sections.count >= 2, sections[0] == "t",
              sections[1] != "." && sections[1] != "..",
              sections.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else { return nil }
        return components.url
    }
}

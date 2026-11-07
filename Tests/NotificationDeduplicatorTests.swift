import Foundation

@main
struct NotificationDeduplicatorTests {
    static func main() {
        func time(_ seconds: TimeInterval) -> Date {
            Date(timeIntervalSince1970: 1_800_000_000 + seconds)
        }

        let keyA = "/t/alice\u{001f}Alice\u{001f}Hello 😊"
        let keyB = "/t/alice\u{001f}Alice\u{001f}Genuine new reply"
        var immediate = NotificationDeduplicator()
        assert(immediate.evaluate(key: keyA, source: "dom", at: time(0)) == .deliver)
        assert(immediate.evaluate(key: keyA, source: "dom", at: time(1)) == .duplicateSameSource)
        assert(immediate.evaluate(key: keyA, source: "web", at: time(3)) == .duplicateCrossSource)
        assert(immediate.evaluate(key: keyB, source: "dom", at: time(3)) == .deliver)
        assert(immediate.evaluate(key: keyA, source: "dom", at: time(9)) == .duplicateHistoricalDOMReplay,
               "Intervening sidebar text is not proof that an already notified DOM preview is a new message")
        assert(immediate.evaluate(key: keyA, source: "web", at: time(12)) == .deliver,
               "An explicit fresh Web Notification with the same body remains eligible")

        var focused = NotificationDeduplicator()
        focused.didResignActive(at: time(10))
        assert(focused.evaluate(key: keyA, source: "dom", at: time(11)) == .deliver)
        assert(focused.evaluate(key: keyB, source: "dom", at: time(18)) == .deliver)
        focused.didBecomeActive(at: time(21 * 60))
        assert(focused.evaluate(key: keyA, source: "dom", at: time(21 * 60 + 1)) == .duplicateOnFocus,
               "An already-delivered background message must not replay after refocus")
        assert(focused.evaluate(key: keyB, source: "dom", at: time(21 * 60 + 3)) == .duplicateOnFocus,
               "Recent and older background notifications both need focus replay protection")

        let newMessage = "/t/alice\u{001f}Alice\u{001f}Actual new message after refocus"
        assert(focused.evaluate(key: newMessage, source: "dom", at: time(21 * 60 + 4)) == .deliver,
               "Real new incoming text after focus must still notify")
        assert(focused.evaluate(key: keyA, source: "dom", at: time(21 * 60 + 11)) == .duplicateHistoricalDOMReplay,
               "Old DOM previews still cannot become a new message just after the focus grace window")

        // Previously-delivered text from another background cycle must not be
        // treated as a replay of the current background session.
        focused.didResignActive(at: time(21 * 60 + 20))
        focused.didBecomeActive(at: time(21 * 60 + 22))
        assert(focused.evaluate(key: keyB, source: "dom", at: time(21 * 60 + 23)) == .duplicateHistoricalDOMReplay,
               "Changing focus epochs cannot turn old DOM snapshots into new chat events")
        let brandNew = "/t/alice\u{001f}Alice\u{001f}Brand new text in the next background epoch"
        assert(focused.evaluate(key: brandNew, source: "dom", at: time(21 * 60 + 24)) == .deliver,
               "A genuinely new preview remains eligible even in a new background epoch")

        // Unrelated focus activations, such as app launch, must not enable
        // the replay-suppression mode.
        var startup = NotificationDeduplicator()
        startup.didBecomeActive(at: time(0))
        assert(startup.evaluate(key: keyA, source: "dom", at: time(0)) == .deliver)
        assert(startup.evaluate(key: keyA, source: "dom", at: time(4)) == .duplicateLastPreview)

        // An unchanged duplicate delivered after background can still be
        // reported if it has a different conversation or actual message text.
        var distinct = NotificationDeduplicator()
        distinct.didResignActive(at: time(0))
        assert(distinct.evaluate(key: keyA, source: "dom", at: time(1)) == .deliver)
        distinct.didBecomeActive(at: time(600))
        assert(distinct.evaluate(key: "/t/bob\u{001f}Bob\u{001f}Hello 😊",
                                 source: "dom", at: time(601)) == .deliver)

        // Real field regression: one emoji in the chat was displayed as
        // three separate notification banners several minutes apart, without
        // a corresponding distinct new message in the conversation.
        var repeatedEmoji = NotificationDeduplicator()
        let emoji = "/t/alice\u{001f}Ba Ông Tam Đa\u{001f}Ma: 😂"
        let newEmoji = "/t/alice\u{001f}Ba Ông Tam Đa\u{001f}Ma: 😁"
        assert(repeatedEmoji.evaluate(key: emoji, source: "dom", at: time(0)) == .deliver)
        assert(repeatedEmoji.evaluate(key: emoji, source: "dom", at: time(60)) == .duplicateLastPreview,
               "Same last emoji re-rendered at +1min should not notify again")
        assert(repeatedEmoji.evaluate(key: emoji, source: "web", at: time(180)) == .duplicateLastPreview,
               "Same last emoji across sources at +3min should not notify again")
        assert(repeatedEmoji.evaluate(key: emoji, source: "dom", at: time(300)) == .duplicateLastPreview,
               "Same last emoji +5min should not notify again")
        assert(repeatedEmoji.evaluate(key: newEmoji, source: "dom", at: time(301)) == .deliver,
               "Different actual reply must notify immediately")
        assert(repeatedEmoji.evaluate(key: emoji, source: "dom", at: time(302)) == .duplicateHistoricalDOMReplay,
               "A -> B -> A from the same sidebar is an old preview replay, not a new emoji")
        assert(repeatedEmoji.evaluate(key: emoji, source: "web", at: time(315)) == .deliver,
               "New Web Notification is not blanket muted by the DOM-only historical guard")

        // Different conversation, same body: no cross-chat suppression.
        let otherThread = "/t/bob\u{001f}Bob\u{001f}Ma: 😂"
        assert(repeatedEmoji.evaluate(key: otherThread, source: "dom", at: time(305)) == .deliver)

        var expires = NotificationDeduplicator()
        assert(expires.evaluate(key: emoji, source: "dom", at: time(0)) == .deliver)
        assert(expires.evaluate(key: emoji, source: "dom", at: time(600)) == .duplicateLastPreview)
        assert(expires.evaluate(key: emoji, source: "dom", at: time(601)) == .duplicateLastPreview,
               "A re-render seconds later is still the same last message")
        assert(expires.evaluate(key: emoji, source: "dom", at: time(45 * 60 + 1)) == .deliver,
               "Historical DOM dedup expires after 45 minutes and is never permanent")

        // Repeating a historical preview after an unrelated status or emoji
        // must not create a new banner in another conversation. A different
        // path remains independently eligible.
        var oscillation = NotificationDeduplicator()
        let oldPreview = "/t/group\u{001f}Group\u{001f}Last message"
        let statusPreview = "/t/group\u{001f}Group\u{001f}Ongoing call"
        assert(oscillation.evaluate(key: oldPreview, source: "dom", at: time(0)) == .deliver)
        assert(oscillation.evaluate(key: statusPreview, source: "dom", at: time(65)) == .deliver)
        assert(oscillation.evaluate(key: oldPreview, source: "dom", at: time(70)) == .duplicateHistoricalDOMReplay)
        assert(oscillation.evaluate(key: oldPreview, source: "dom", at: time(15 * 60)) == .duplicateHistoricalDOMReplay)
        assert(oscillation.evaluate(key: "/t/other\u{001f}Other\u{001f}Last message",
                                    source: "dom", at: time(71)) == .deliver)

        print("Notification deduplicator tests passed: same/cross source, DOM A-B-A replay, 21-minute focus, emoji oscillation, fresh Web events and expiry")
    }
}

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
        assert(immediate.evaluate(key: keyA, source: "dom", at: time(9)) == .deliver,
               "Identical text later must not be permanently suppressed")

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
        assert(focused.evaluate(key: keyA, source: "dom", at: time(21 * 60 + 11)) == .deliver,
               "After focus grace window, old content is not blocked indefinitely")

        // Previously-delivered text from another background cycle must not be
        // treated as a replay of the current background session.
        focused.didResignActive(at: time(21 * 60 + 20))
        focused.didBecomeActive(at: time(21 * 60 + 22))
        assert(focused.evaluate(key: keyB, source: "dom", at: time(21 * 60 + 23)) == .deliver,
               "A different background epoch cannot replay-suppress historical text")

        // Unrelated focus activations, such as app launch, must not enable
        // the replay-suppression mode.
        var startup = NotificationDeduplicator()
        startup.didBecomeActive(at: time(0))
        assert(startup.evaluate(key: keyA, source: "dom", at: time(0)) == .deliver)
        assert(startup.evaluate(key: keyA, source: "dom", at: time(4)) == .deliver)

        // An unchanged duplicate delivered after background can still be
        // reported if it has a different conversation or actual message text.
        var distinct = NotificationDeduplicator()
        distinct.didResignActive(at: time(0))
        assert(distinct.evaluate(key: keyA, source: "dom", at: time(1)) == .deliver)
        distinct.didBecomeActive(at: time(600))
        assert(distinct.evaluate(key: "/t/bob\u{001f}Bob\u{001f}Hello 😊",
                                 source: "dom", at: time(601)) == .deliver)

        print("Notification deduplicator tests passed: same/cross source, 21-minute background replay, focus epoch and new messages")
    }
}

import Foundation

@main
struct IncomingCallAlertGateTests {
    static func main() {
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        var gate = IncomingCallAlertGate()

        func at(_ seconds: TimeInterval) -> Date { start.addingTimeInterval(seconds) }
        func check(_ condition: Bool, _ message: String) {
            if !condition {
                fatalError("IncomingCallAlertGate: \(message)")
            }
        }

        check(gate.ringtoneSignal(at: at(0)), "first ringtone must arm an alert")
        check(!gate.ringtoneSignal(at: at(2)), "repeated play() must not queue another alert")
        check(gate.fallbackNotification(at: at(1.5)),
              "fallback must NOT depend on AppKit ringtone state")
        check(!gate.fallbackNotification(at: at(10)), "duplicate fallback blocked")
        check(gate.ringtoneSignal(at: at(28)), "future ringtone burst can rearm")
        check(!gate.fallbackNotification(at: at(30)), "burst alone must not post duplicate within throttle")
        check(gate.fallbackNotification(at: at(48)), "future call can issue another fallback")
        check(gate.webCallHint(at: at(50)), "web notification can independently detect a call")
        check(!gate.webCallHint(at: at(51)), "repeated web notification must not spam")

        var dialog = IncomingCallAlertGate()
        check(dialog.confirmedDialog(sessionID: "new-call-1", at: at(0)),
              "live incoming dialog always generates native alert")
        check(!dialog.confirmedDialog(sessionID: "new-call-1", at: at(4)),
              "same call should be reported once")
        check(!dialog.fallbackNotification(at: at(5)),
              "fallback should not duplicate confirmed dialog")
        check(dialog.confirmedDialog(sessionID: "new-call-2", at: at(9)),
              "different real call session can notify even within fallback throttle")
        check(dialog.dialogAlerts == 2, "two distinct dialog sessions")
        check(dialog.fallbackAlerts == 0, "no fallback when dialog found")

        var delayed = IncomingCallAlertGate()
        check(delayed.fallbackNotification(at: at(0)), "unknown call sends generic banner")
        check(!delayed.confirmedDialog(sessionID: "appeared-late", at: at(2)),
              "late dialog should not duplicate banner")
        check(delayed.confirmedDialog(sessionID: "another-call", at: at(12)),
              "a genuinely new dialog is not indefinitely suppressed")
        print("Call alert gate passed: ringtone/notification decoupling, distinct sessions, duplicate and missed-call protections.")
    }
}

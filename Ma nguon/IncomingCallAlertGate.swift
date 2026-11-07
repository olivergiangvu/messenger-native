import Foundation

/// Pure, deterministic deduplication for incoming call notification attempts.
/// This is independent of NSSound playback: a blocked ringtone must never
/// suppress a macOS notification for a genuine incoming-call signal.
struct IncomingCallAlertGate {
    private var lastRingtoneBurstAt: Date?
    private var lastWebHintAt: Date?
    private var lastAlertAt: Date?
    private var lastDialogSession: String?

    private(set) var ringtoneSignals = 0
    private(set) var webCallSignals = 0
    private(set) var dialogSignals = 0
    private(set) var dialogAlerts = 0
    private(set) var fallbackAlerts = 0
    private(set) var suppressed = 0

    mutating func ringtoneSignal(at now: Date) -> Bool {
        ringtoneSignals += 1
        if let last = lastRingtoneBurstAt, now.timeIntervalSince(last) < 25 {
            suppressed += 1
            return false
        }
        lastRingtoneBurstAt = now
        return true
    }

    mutating func webCallHint(at now: Date) -> Bool {
        webCallSignals += 1
        if let last = lastWebHintAt, now.timeIntervalSince(last) < 25 {
            suppressed += 1
            return false
        }
        lastWebHintAt = now
        return true
    }

    mutating func confirmedDialog(sessionID: String, at now: Date) -> Bool {
        dialogSignals += 1
        guard !sessionID.isEmpty, sessionID != lastDialogSession else {
            suppressed += 1
            return false
        }
        // A session ID comes from a live incoming-call dialog, not a chat row.
        lastDialogSession = sessionID
        // Do not duplicate the fallback banner if its delayed POST just won.
        if let last = lastAlertAt, now.timeIntervalSince(last) < 8 {
            suppressed += 1
            return false
        }
        lastAlertAt = now
        dialogAlerts += 1
        return true
    }

    mutating func fallbackNotification(at now: Date) -> Bool {
        if let last = lastAlertAt, now.timeIntervalSince(last) < 45 {
            suppressed += 1
            return false
        }
        lastAlertAt = now
        fallbackAlerts += 1
        return true
    }
}

import AppKit
import Foundation

/// Native incoming-call ringtone. WebKit never plays the known message/call
/// ringtone files, preventing tiny audio clips from appearing as Now Playing.
///
/// Every playback is non-looping. We refresh one short sound on a timer only
/// while there is evidence of an incoming call, with a hard 55s cutoff.
final class IncomingCallRinger {
    private var sound: NSSound?
    private var timer: Timer?
    private var startedAt: Date?
    private var lastDialogSeen: Date?
    private var blockedUntil: Date = .distantPast

    private(set) var soundCandidates = 0
    private(set) var sessionsStarted = 0
    private(set) var sessionsStopped = 0
    private(set) var duplicateCandidates = 0
    private(set) var lastStopReason = "none"

    var isRinging: Bool { startedAt != nil }

    func soundCandidate() {
        soundCandidates += 1
        let now = Date()
        guard now >= blockedUntil else {
            duplicateCandidates += 1
            return
        }
        // Repeated MediaElement.play calls must NEVER prolong a stale call.
        guard startedAt == nil else {
            duplicateCandidates += 1
            return
        }
        begin(now)
    }

    func incomingDialogVisible() {
        let now = Date()
        guard now >= blockedUntil else { return }
        if startedAt == nil { begin(now) }
        lastDialogSeen = now
    }

    private func begin(_ now: Date) {
        startedAt = now
        lastDialogSeen = nil
        sessionsStarted += 1
        // System audio is a normal AppKit sound, not a WKWebView media session.
        // Non-looping + hard timeout prevent ghost ringing.
        sound = NSSound(named: NSSound.Name("Funk"))
            ?? NSSound(named: NSSound.Name("Glass"))
            ?? NSSound(named: NSSound.Name("Tink"))
        sound?.loops = false
        sound?.volume = 0.85
        _ = sound?.play()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 2.6, repeats: true) { [weak self] _ in
            self?.tick()
        }
        NSLog("MN CALL: native ringtone started")
    }

    private func tick() {
        guard let startedAt else { return }
        let now = Date()
        if now.timeIntervalSince(startedAt) > 55 {
            stop(reason: "55-second safety cutoff")
            return
        }
        // A known call audio event alone is not proof the call is still
        // incoming. Without a live call dialog, stop after 8 seconds.
        let last = lastDialogSeen ?? startedAt
        if now.timeIntervalSince(last) > 8 {
            stop(reason: "no active incoming-call dialog")
            return
        }
        // The same NSSound is reused; no overlapping/repeating player.
        if sound?.isPlaying != true { _ = sound?.play() }
    }

    func stop(reason: String) {
        if startedAt != nil {
            sessionsStopped += 1
            lastStopReason = reason
            NSLog("MN CALL: native ringtone stopped (%@)", reason)
        }
        timer?.invalidate()
        timer = nil
        _ = sound?.stop()
        sound = nil
        startedAt = nil
        lastDialogSeen = nil
        // Prevent a late WebKit play() or delayed DOM callback from bringing
        // back the ringtone after hangup. A later fresh call can ring.
        blockedUntil = Date().addingTimeInterval(3)
    }

    var status: String {
        "Active: \(isRinging) | Started: \(sessionsStarted) | Stopped: \(sessionsStopped)"
        + " | Web ringtone events: \(soundCandidates) | Duplicate events: \(duplicateCandidates)"
        + " | Last stop: \(lastStopReason)"
    }
}

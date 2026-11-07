import Foundation

/// Deduplicates notification delivery using the *same* native boundary for
/// intercepted web notifications and DOM fallback notifications.
///
/// In particular, when the user foregrounds the app after receiving a
/// notification while it was backgrounded, Messenger can re-render/replay
/// its last chat preview. Do not deliver it again merely because it reappears
/// on focus. This class stores only bounded, in-process fingerprints.
struct NotificationDeduplicator {
    enum Decision: Equatable {
        case deliver
        case duplicateSameSource
        case duplicateCrossSource
        case duplicateOnFocus
        case duplicateLastPreview
        case duplicateHistoricalDOMReplay
    }

    private struct Record {
        let timestamp: Date
        let source: String
        let backgroundEpoch: Int?
    }

    // The most recently DELIVERED preview for a thread. Messenger's chat
    // sidebar may oscillate during WebKit refresh/focus, presenting the same
    // last message again minutes later with a new synthetic notification ID.
    // This prevents repeat banners without blanket-muting focused windows.
    private struct LastPreview {
        let key: String
        let timestamp: Date
    }

    private var records: [String: Record] = [:]
    private var lastByThread: [String: LastPreview] = [:]
    private var backgroundEpoch = 0
    private var inBackground = false
    private var resumedEpoch: Int?
    private var resumedAt: Date?

    private let keepFor: TimeInterval = 50 * 60
    private let sameSourceWindow: TimeInterval = 2
    private let lastPreviewWindow: TimeInterval = 10 * 60
    // DOM previews lack independent message IDs. If a previously submitted
    // text reappears later after an intervening sidebar status/preview, it is
    // NOT evidence of a new message. Keep it from generating another banner
    // for up to 45 minutes. Only constrain DOM fallback events; a genuinely
    // new intercepted Web Notification remains eligible.
    private let historicalDOMReplayWindow: TimeInterval = 45 * 60
    private let crossSourceWindow: TimeInterval = 8
    private let resumeWindow: TimeInterval = 10
    private let maxRecords = 250

    mutating func didResignActive(at now: Date = Date()) {
        backgroundEpoch += 1
        inBackground = true
        resumedAt = nil
        resumedEpoch = nil
    }

    mutating func didBecomeActive(at now: Date = Date()) {
        // Only a real background->foreground transition gets a replay grace
        // window. Initial app startup / repeated active notifications do not.
        guard inBackground else { return }
        inBackground = false
        resumedAt = now
        resumedEpoch = backgroundEpoch
    }

    mutating func evaluate(key: String, source: String, at now: Date = Date()) -> Decision {
        records = records.filter { now.timeIntervalSince($0.value.timestamp) >= 0 &&
            now.timeIntervalSince($0.value.timestamp) <= keepFor }
        lastByThread = lastByThread.filter {
            let age = now.timeIntervalSince($0.value.timestamp)
            return age >= 0 && age <= lastPreviewWindow
        }
        // The key is <thread><US><title><US><body>. Keep the conversation
        // identity separately from the preview body, without a server ID.
        let thread = String(key.prefix(while: { $0 != "\u{001f}" }))

        if let previous = records[key] {
            let age = now.timeIntervalSince(previous.timestamp)
            if age >= 0 {
                if previous.source != source && age <= crossSourceWindow {
                    return .duplicateCrossSource
                }
                if previous.source == source && age <= sameSourceWindow {
                    return .duplicateSameSource
                }
                if let focusAt = resumedAt,
                   let focusEpoch = resumedEpoch,
                   previous.backgroundEpoch == focusEpoch,
                   focusAt.timeIntervalSince(previous.timestamp) >= 0,
                   now.timeIntervalSince(focusAt) >= 0,
                   now.timeIntervalSince(focusAt) <= resumeWindow {
                    return .duplicateOnFocus
                }
            }
        }

        // PR #12's prior lastByThread guard only remembered the LATEST
        // accepted preview. When the sidebar oscillates A -> status B -> A,
        // the earlier A would become eligible again. Retain a bounded
        // historical record for heuristic DOM-only notifications.
        if source == "dom", let previous = records[key] {
            let age = now.timeIntervalSince(previous.timestamp)
            if age >= 0 && age <= historicalDOMReplayWindow {
                return .duplicateHistoricalDOMReplay
            }
        }

        // Identical last message reappearing after 1–5 minutes is a
        // re-render of the existing preview unless there is independent
        // message identity evidence. The earlier 2/8-second guards cannot
        // stop these repeated banners. A *different* delivered preview
        // advances the thread, so a later repeat of old text remains eligible.
        if let last = lastByThread[thread],
           last.key == key,
           now.timeIntervalSince(last.timestamp) >= 0,
           now.timeIntervalSince(last.timestamp) <= lastPreviewWindow {
            return .duplicateLastPreview
        }

        records[key] = Record(timestamp: now, source: source,
                              backgroundEpoch: inBackground ? backgroundEpoch : nil)
        lastByThread[thread] = LastPreview(key: key, timestamp: now)
        if records.count > maxRecords,
           let oldest = records.min(by: { $0.value.timestamp < $1.value.timestamp })?.key {
            records.removeValue(forKey: oldest)
        }
        if lastByThread.count > maxRecords,
           let oldest = lastByThread.min(by: { $0.value.timestamp < $1.value.timestamp })?.key {
            lastByThread.removeValue(forKey: oldest)
        }
        return .deliver
    }
}

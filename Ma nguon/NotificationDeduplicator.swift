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
    }

    private struct Record {
        let timestamp: Date
        let source: String
        let backgroundEpoch: Int?
    }

    private var records: [String: Record] = [:]
    private var backgroundEpoch = 0
    private var inBackground = false
    private var resumedEpoch: Int?
    private var resumedAt: Date?

    private let keepFor: TimeInterval = 50 * 60
    private let sameSourceWindow: TimeInterval = 2
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

        records[key] = Record(timestamp: now, source: source,
                              backgroundEpoch: inBackground ? backgroundEpoch : nil)
        if records.count > maxRecords,
           let oldest = records.min(by: { $0.value.timestamp < $1.value.timestamp })?.key {
            records.removeValue(forKey: oldest)
        }
        return .deliver
    }
}

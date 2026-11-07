# Call popup/notification regression — targeted Git diff audit (2026-11-04 18:51 → 2026-11-05 18:51 Asia/Bangkok)

## Scope and evidence

The user reports the application had **working incoming call popups + macOS notifications on prior builds**. First reported regression: an audio call missed around 18:51 on 2026-11-05, with neither call popup nor call banner observed. The app installed at that time was NOT rebuilt from PR #18 or #19, so these are ruled out as the code first installed when this was observed.

This audit compares the actual GitHub source changes in PRs #11–#17, using PR #4 as the earlier call-detector historical reference. A **source match proves these regions were not edited**, but cannot prove what code was in the user's installed binary (no embedded Git SHA) or whether an upstream live-call event reached WebKit.

## Critical code regions — exact source equality

Across PRs #4, #10, #11, #12, #13, #14, #15, #16, and #17:

1. Embedded incoming-call DOM detector from `const nutGoiDen` through `window.__mnCallDetectionStatus`: byte-for-byte equal, 6,275 characters. Core: `[role="dialog"] [aria-label]`, `700 ms` fallback poll, `MutationObserver` + fast debounce, and `goiDenHien/goiDenAn` bridge.
2. Swift `capNhatBangGoi()` and floating panel conditions: byte-for-byte equal, 3,876 characters. Deliberately no native floating panel when main Messenger window is already focused and visible.
3. `jsThongBao` before the call selector is unchanged through PR #12. PR #13 deletes the legacy Dock unread 3s reader only; subsequent PRs retain that edit. References to deleted `daBao`, `batDau`, `soCu` are absent from the embedded script.
4. User content script setup and route code were changed in earlier PRs, but PR #11–#17 did NOT remove `jsThongBao`, `incoming-call-audio.js` or their shared `vmThongBao` native message handler.

## Per-PR indirect interaction audit (within 24 h)

| PR | Changed relevant behavior | Can it directly remove incoming-call popup? | Plausible indirect concern |
|---|---|---|---|
| #11 | All-window message notifications; `notification-engine.js` scanning/events; native **message** chime now entirely system notification | No, call DOM and native panel unchanged | Extra DOM scans/event observer and page load, but no `preventDefault`, `stopPropagation`, deletion or modification of call elements seen |
| #12 | `NotificationDeduplicator` focus replay; observer calls `didResignActive/didBecomeActive` | No | Notification focus state, but only within **message** coordinator, not incoming-call bridge |
| #13 | Remove legacy 3s unread Dock count from `jsThongBao`; replace with badge from `notification-engine.js` | No | Edit in same injected script, but no dangling references found; call detector section unchanged |
| #14 | Suppress generic unread-message status; stable ID to replace same-thread card (subsequently reverted) | No | Generic filter matches exact unread/new-message strings, not confirmed call/ringtone; only inside `NativeNotificationCoordinator.deliver` |
| #15 | Restore unique IDs in Notification Center to retain message history | No | Presentation history only |
| #16 | Reels/video link interception at document capture and native routing | No on passive incoming call | Its click listener can `preventDefault/stopImmediatePropagation` **only for classified Facebook video link clicks**, not when receiving a call. LinkRouting does not classify `/groupcall` as a Reel/video |
| #17 | Remove relative timestamp from message previews and prevent duplicate aging-based messages | No | Only `notification-engine.js`; no call path or call notification selector edits |

PR #18 **does** reduce idle recovery polling from 700 ms to 1,400 ms, but wasn't installed at first report. PR #20 initially *introduced* another regression by limiting the legacy call selector to `button[aria-label]` or `[role=button][aria-label]`. That has been reverted in PR #20 (original selector restored first), with regression test for nested `SPAN aria-label` controls. Neither explains the **first** missed call on an earlier app.

## Native banner path

Before PR #20, the `goiDenHien` handler updated `goiDen` and a floating panel; it **did not itself send a native macOS call banner**. Incoming-call-related banners were therefore dependent on the page's intercepted Web Notification or DOM **message** fallback. There is no proof an incoming call generates a page notification in every browser state.

The message-side `NativeNotificationCoordinator.deliver` only receives payloads with an `id`; `boTinGoi` is an explicit UI setting that suppresses some *chat-message previews* about calls while a call panel is active; it does not suppress the call-detector `goiDenHien` bridge.

## Highest-value next check (ONE app build, not old-version reinstall chain)

No diff in PRs #11–#17 establishes a direct source-level cause for both the missing native panel and the missing banner. The shortest causal investigation is a **single live call with a diagnostic build**, reading:

- Was the original embedded call detector installed in the page and polling? (`window.__mnCallDetectionStatus`: `installed`, `scans`, `observerAttached`, active dialog, labeled control counts)
- Did any real-time incoming-call signal reach Swift? (Audio signals, Web live-call hints, dialog signals)
- If yes, did native presentation succeed? (`goiDen`/panel visible, requested notification count + errors, Focus setting)
- If page call UI never materializes, source history alone does not identify why. Compare the installed binary signature/build with an explicitly known-good local artifact if one exists; do **not** label PR #4 as last known good.

If real-call instrumentation still cannot explain the failure, add an **opt-in runtime switch** that disables only the PR #11–#17 message notification engine in the *same build* and test another call. This is more efficient than building/installing 4 historical applications. Do not ship such a switch enabled by default or turn off user message notifications in production.

## Release gate

- User explicitly forbids any GitHub Pre-release until the real call popup, native banner and a second consecutive call work.
- PR #20 remains Draft; PR #18/#19 RAM experiments remain on hold.
- Automated tests and synthetic dialogs do not validate upstream Messenger calls.

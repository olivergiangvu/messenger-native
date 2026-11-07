# Single-build incoming-call regression isolation (PR #20)

## Why only one test build

The Nov 4–5 notification-diff audit found:
- Original incoming-call JavaScript detector and Swift floating panel are unchanged across PRs #11–#17.
- PR #12's ten-minute duplicate-message filter can suppress a second identical *message-like* web notification, but it cannot remove an incoming-call dialog or the native floating panel.
- In PR #20, recognized live incoming-call Web Notifications use `mnWebIncomingCallHint`, a dedicated bridge path, **not** the generic `NativeNotificationCoordinator.deliver` / message deduplicator. Missed-call messages retain their ordinary notifications.
- A passive DOM scanner introduced for incoming message previews could conceivably interfere through main-thread work, but no current evidence proves this.

Therefore avoid reinstalling old PR #4/#16/#17 builds. Use one PR #20 test build with a reversible in-page A/B switch and capture one real call in each condition.

## New diagnostics and exact meanings

Open **View → Call Diagnostics…**:

- `detection.installed`, `observerAttached`, `scans`: was the main-document call detector injected and running?
- `detection.liveDialogScanHits`: number of positive call-dialog scans, not unique calls.
- `detection.incomingBridgeReports`: times the DOM detector sent `goiDenHien` to Swift. May be more than one per call if the web dialog re-renders.
- `detection.endedBridgeReports`: times it sent `goiDenAn`.
- `detection.secondsSinceLastIncomingDialog`: relative seconds, no caller name or page text.
- `audio.suppressedWebRingtones`: how often a known incoming-call sound was intercepted.
- `Audio signals`, `Web notification call hints`, `Call dialogs observed`: native counters showing which call signals reached Swift.
- `Native call notifications requested` and `Native notification errors`: request/submission signals, **not confirmation** that macOS actually displayed a banner.
- `domMessageScanner.paused`: `false` by default; `true` only after the user presses the A/B toggle.

**A/B button:** **Bật/tắt quét tin (A/B)** inside Call Diagnostics. This toggles only the DOM **message fallback** scanner without reinstalling or reloading the app. The incoming-call detector, incoming ringtone bridge, Web Notification bridge, app data, and cookies remain enabled. **While paused, some incoming message alerts may be missed.** The switch resets to normal on a page reload or app restart. On resuming, it makes a silent baseline to prevent sending backlog notifications.

**Other two diagnostics buttons:** **Thử banner** and **Thử bảng nổi** display synthetic test UI. These are NOT a substitute for a real incoming call.

## One controlled trial

1. Keep PR #20 as **Draft** and wait for macOS CI to pass. Build and install the branch **once** on the Mac:

   ```bash
   cd ~/messenger-native
   git fetch origin
   git switch fix/incoming-call-alert-reliability
   git pull --ff-only
   bash build.sh && bash install-local.sh
   ```

   This replaces the installed app bundle but does not explicitly clear WKWebView website data or cookies. It has not been published as a release or prerelease.

2. In the new app, open **View → Call Diagnostics…** and note the `domMessageScanner.paused=false` status. Close the dialog and leave Messenger in the background behind Finder.
3. From a second account/device, place **one real incoming audio call**. Look for (a) Messenger's own call dialog, (b) native floating panel, (c) macOS banner and ringtone. Hang up. Open **Call Diagnostics** and save a screenshot.
4. Wait at least **60 seconds** before the next attempt (the generic call-alert gate has a 45-second dedup window). Click **Bật/tắt quét tin (A/B)** and verify the app says `ĐÃ TẠM DỪNG`; **do not reload** the page. Return Messenger to the background behind Finder.
5. Place one more real incoming audio call using the same caller. Observe the same four outcomes and capture **Call Diagnostics**. Restore scanning by pressing **Bật/tắt quét tin (A/B)** again, verifying `domMessageScanner.paused=false`.

**Do not compare a foreground attempt with a background attempt:** the original native floating-call panel is deliberately hidden while the main Messenger window is frontmost/key.

## How to interpret the pair

| Observation | Meaning |
|---|---|
| With scanner ON no real call, with scanner PAUSED call comes through | Evidence the DOM message scanner could be interfering; isolate its observer/scheduling before production changes. Not yet proof of precisely how. |
| Both attempts: `scans` increments but `liveDialogScanHits`, `Audio signals` and `Web notification call hints` stay zero | Detector runs but no recognized real-time call indicators reached the page's instrumented pathways; no basis to alter macOS notification presentation further. |
| `incomingBridgeReports > 0`, but Swift `Call dialogs observed = 0` | JS-to-Swift forwarding/handler mismatch; inspect `vmThongBao` delivery and main-frame ownership. |
| Swift reports a call and `goiDen`, yet no floating panel when the app is backgrounded | Investigate `capNhatBangGoi` conditions, `bangGoiNoi` setting, NSWindow order and macOS Space state. |
| Native request count increments but no banner | Look at notification authorization, system Focus, banner settings and native request errors. |
| Both real calls display popup + banner | Repeat a third incoming call and test termination/answer behavior before marking the fix verified. |

**Never claim a regression is fixed solely from CI or the mock banner.**

## Release gate

- No tag, Release or Pre-release until **incoming web/native popup, macOS banner, second consecutive call, hangup** all pass on the Mac.
- No PR #18/#19 RAM optimization deployment until calls are verified.
- Preserve normal message notification behavior in production; A/B pause must remain an opt-in temporary diagnostic only.

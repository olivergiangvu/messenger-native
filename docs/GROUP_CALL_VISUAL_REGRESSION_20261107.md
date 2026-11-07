# Group call regression — visual evidence and dedicated group-call candidate (Nov 7, 2026)

## What the three Mac screenshots show

- **14:36**: Messenger conversation and sidebar display a group **"Ongoing call"**, a **"Group video call — Tap to join"** card, and message status "Ma joined the video call". macOS shows a Messenger Native notification from this **message/status**, not from the incoming-call alert system.
- Native Call Diagnostics: `Native call notifications requested = 0`, `Audio signals = 0`, `Web notification call hints = 0`, `Call dialogs observed = 0`. Detector is installed and scanned 573 times, but `liveDialogScanHits = 0`, `incomingBridgeReports = 0`, `openDialogElements = 0`, no accept/decline controls.
- **14:38** after A/B: `domMessageScanner.paused = true`, `observerAttached = false`. Native call counters stay zero. Notification Center still contains an **"The video call ended"** group status message. The **group message banner** may disappear while the DOM message scanner is paused; this does not show that a true native call alert was blocked.
- The app was *active* while screenshots were taken. The existing 1-to-1 floating panel deliberately suppresses itself when the main Messenger window is foreground/key; however the more important point is **there was no incoming-call dialog or native call event at all**.

## Correct distinction: group availability vs ringing call

Messenger's *Group video call — Tap to join* is **joinable group call availability**, not necessarily a direct incoming 1-to-1 call that rings and supplies Accept/Decline buttons. The legacy `role=dialog` detector handles the latter; it does not recognize the former. A generic chat notification ("X joined the video call") is not a native incoming-call notification.

## Draft implementation on PR #20

- `Ma nguon/incoming-group-call.js`: a **separate** bounded, passive call-availability watcher scanning the existing chat list. It requires a current `Ongoing call` status **and** an explicit recent group video/voice call join/start phrase. It reads the status label from either the chat anchor or its row. It is **independent of** `notification-engine.js` and its optional A/B pause.
- Only an **observed inactive -> ongoing** transition within a known conversation is announced. First populated snapshot is silent; simply opening an old group chat cannot cause a false alert. Repeated scans do not spam, and unannounced old calls do not generate ghost "ended" events.
- Native bridge `mnGroupCallStarted` / `mnGroupCallEnded`: validates a local `/t/...` conversation path, shows a special non-activating **"Cuộc gọi nhóm đang diễn ra"** panel with **Mở nhóm / Bỏ qua**, and delivers a distinct macOS group-availability banner with native safe deep link.
- **Mở nhóm** navigates the existing Messenger SPA using the approved conversation navigation helper; it **does not auto-join**, fake accept/decline, start the camera, or leave the call.
- Group panel can appear foreground **because no incoming Accept/Decline web dialog exists**. The ordinary one-to-one call popup remains unchanged.
- A group call end hides that group panel, and a passive 25-second timeout also hides it without cancelling the actual ongoing call.
- Tests simulate actual text/status transitions, silent initial baseline, repeated scans, genuine call end, multiple sessions and A/B scanner paused. The new resource is included in signed app bundling and CI checks.

## Validation before release

Wait for the current macOS CI to pass, install exactly one candidate, keep default `domMessageScanner.paused = false`, and use a second account to start **a fresh group video call** while the group is initially NOT in "Ongoing call" state. Look for:
1. group availability panel with **Mở nhóm / Bỏ qua**;
2. native macOS banner **"Cuộc gọi nhóm đang diễn ra"** (not simply "X joined the call");
3. `Call Diagnostics.groupCall.detectedTransitions > 0`, `New ongoing group call events > 0`, group banner request count;
4. click **Mở nhóm** opens the group conversation and does **not** auto-join;
5. termination hides the panel, no repeated popups after opening old history.

**Separately** test a true **1:1 audio/video call**, because this code does not claim to fix its ringing dialog.

## Release gate

Draft PR only. No tag, release, pre-release or RAM optimization until real foreground/background group alerts, direct call alerts and repeat-call behavior are verified as requested by the user.

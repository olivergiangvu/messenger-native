# Incoming-call alert reliability — Nov 5, 2026

## Report / evidence
On the Mac before memory-optimization PRs #18/#19 were installed, a Messenger conversation displayed a **missed audio call at 18:51** and no incoming-call notification was observed by the user. Normal Messenger Native notification cards remained visible in macOS Notification Center. The screenshot was taken at 18:53, after the call, so it does not prove which live event reached WebKit.

## Current code assumptions
- An incoming Messenger call dialog was recognized only when an ARIA role=dialog/alertdialog had an exact "Chấp nhận" or "Accept" label. Button wording and surrounding structure can vary.
- Native floating call panel was deliberately shown only when the main Messenger chat was not being viewed (app hidden / in background / chat not key). If Messenger is frontmost, the app relies on Messenger's own live dialog.
- `incoming-call-audio.js` intercepts a known ringtone (`taJw7SpZVz2.mp3`) and asks Swift to play a native alert sound. Without a detected dialog, previously there was no macOS notification banner fallback.

## Draft fix
- Allow conservative variants of accept/decline labels, and a non-role call card only when a live-call phrase AND a decline control are both present.
- If a NEW confirmed known ringtone begins but an incoming dialog is not detected in 1.5 seconds, send a generic native notification inviting the user to open Messenger, with no fabricated caller name, answer button, or thread path. The normal dialog path cancels this fallback; it is throttled.
- Extra counters in View > Call Diagnostics identify `Fallback ringtone sessions`, `Fallback call notifications` (queued), and `Fallback avoided when dialog detected`.
- This is a **best-effort fallback**, not native VoIP push. It cannot notify if the upstream Messenger Web page neither renders a call nor plays the recognized ringtone.

## Required real-device check before tagging a release
1. With the old app still running, open **View > Call Diagnostics...** and record the window. It may show historical ringtone counters for the current session.
2. On a test build from this PR, use another device/account to call Messenger while this Mac is (a) showing the chat, (b) behind Finder, (c) minimized for 2–5 minutes.
3. Verify live call panel, native ring, accept/decline, subsequent hangup stopping the ringtone, no duplicate call notifications, and no false positive when a friend/request dialog shows an ordinary "Accept" button.
4. Repeat voice, video, and group incoming calls where possible; test notification taps return to Messenger without forcing page reload.
5. Recheck two genuine message alerts and Notification Center history.
6. If the alert still does not appear, obtain new **View > Call Diagnostics** snapshot immediately after a missed test call, especially `suppressedWebRingtones`, `IncomingDialogActive`, `ObserverAttached`, `sessionsStarted`, `Fallback... counters`. This distinguishes no WebKit event from a detector failure.

**Release caution:** the pre-PR18 installed app is *not* a verified stable rollback for incoming calls until these checks pass. If archived in GitHub, label it `pre-fix backup (known issue: missed incoming call)`, not a stable feature-complete release.

**Branch:** fix/incoming-call-alert-reliability; based on PR #17, independent of PR #18/#19.

## Nov 5 — follow-up after the first candidate still failed on the Mac

The user reports **the newly installed call-fallback build STILL did not show incoming-call notifications**. The first fallback design had a concrete logic flaw:

1. `IncomingCallRinger.stop()` set `needsNewSessionAfterStop=true`; a ringtone signal from a later call could be rejected indefinitely if a matching call dialog did not appear.
2. PR #20's first iteration only scheduled fallback when `sessionsStarted` increased, so the blocked ringtone also blocked the **notification**.
3. Even when a normal call dialog was recognized, the old logic deliberately cancelled the fallback and only showed a floating panel in background, without delivering a macOS call card. In foreground, it relied on Messenger's own dialog.

### Updated behavior (same draft PR #20)

- Incoming-call notification gate is independent of the AppKit ringtone state.
- A *confirmed* incoming dialog triggers a one-per-session native macOS call notification (foreground **and** background). Any pending generic fallback is cancelled.
- A known incoming ringtone starts a one-shot fallback notification after 1.5 s if no dialog was reported; sound playback is not a prerequisite. New audio elements have stable opaque tokens to re-arm the ringer.
- Explicit live incoming Web Notification hints are a third path. A message about a **missed** call is **not** a live-call signal.
- Call Diagnostics now reports signal counts and native notification requests/errors to distinguish upstream WebKit events vs downstream notification failures.
- No new app build is marked as a release before a real incoming call test verifies foreground, background, audio/video and hangup behavior.

### Trial instructions (after CI green)

```bash
cd ~/messenger-native
git fetch origin
git switch fix/incoming-call-alert-reliability
git pull --ff-only
bash build.sh && bash install-local.sh
```

Test using a call from a second account/device. Open `View -> Call Diagnostics...` right after the test and check `Audio signals`, `Web notification call hints`, `Call dialogs observed`, `Native call notifications requested`, and `Native notification errors`.

**If all three incoming-call signal counters stay zero while a call appears as missed in Messenger**, the live call is not being surfaced through any of the supported signals in this WKWebView instance. This build cannot manufacture a reliable VoIP incoming call notification without a supported upstream real-time signal. Stop adding speculative timers or fake push mechanisms and investigate Messenger Web feature support, account state and upstream signaling.

No Pre-release/tag/rollback release has been created by these changes.

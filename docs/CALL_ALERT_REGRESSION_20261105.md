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

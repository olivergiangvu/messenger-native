# Camera/Microphone preflight and faster incoming-call UI

Branch: `feature/call-permissions-latency`. Base: `feature/call-ringtone-lifecycle`.

## What changed

- The **Settings → Cuộc gọi** page now shows the current macOS TCC status for Microphone and Camera.
- When status is "Chưa yêu cầu", clicking **Cho phép** invokes `AVCaptureDevice.requestAccess(for:)` with a user gesture. It does **not** start capture, record sound or open the camera.
- For already authorized / denied / restricted devices, a button opens the macOS Privacy settings. Denied access must be changed by the user in macOS System Settings.
- The embedded Messenger website keeps the existing origin-checking `WKUIDelegate.requestMediaCapturePermissionFor` path; macOS app authorization and website permission are not the same thing.
- Incoming-call dialog detection now uses a targeted, throttled `MutationObserver` (~70ms after relevant dialog insertion/change) with the previous 700ms polling fallback, instead of waiting for the next poll on every call.
- **Xem → Call Diagnostics…** now includes `detection.observerAttached`, `detection.scans` and `detection.observerScans`.

### Important limits

This reduces only **local page detection latency**, not the time Meta takes to signal a call, the time the web page takes to render its call dialog, or the time macOS takes to display a system notification.

The existing ghost-ringtone fix and same-session WebKit-popup deduplication remain unchanged.

## Distinguish duplicate call records from multiple active clients

The user observed that entries appear in pairs when both a separate browser Facebook session and Messenger Native are active. The application can prevent two internal `/groupcall/` windows, but it **cannot coordinate or deactivate a completely separate Edge/Safari browser session**, nor can it safely modify server-side Messenger call history.

To isolate the cause, make exactly **one** incoming call per test, allowing 30–60 seconds between tests:

| Test | Messenger Native | Facebook/Messenger web | Inspect call entries |
|---|---|---|---|
| A | Running | Browser fully quit (Cmd+Q) | Native chat and mobile Messenger |
| B | Quit | Browser running | Web chat and mobile Messenger |
| C | Running | Browser running | Native chat, web chat and mobile Messenger |

If **duplicate entries appear on mobile Messenger as well**, that supports synchronized/account-level duplicate events rather than a purely local WKWebView presentation glitch. If they appear only in one desktop client, investigate rendering, page state or caching on that client.

Do not blindly hide two similar-looking missed-call messages: distinct calls can occur in the same minute. Muting browser notifications alone does not prove that the browser stopped receiving calls.

### Testing on macOS

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/call-permissions-latency
bash build.sh
bash install-local.sh
```

If local branch exists, use `git switch feature/call-permissions-latency && git pull --ff-only`.

Then navigate to Messenger Native → **Cài đặt… → Cuộc gọi**, click **Cho phép** for each permission. Verify states change to "Đã cho phép" after granting permission. Test one incoming call with the browser fully closed, then inspect **Xem → Call Diagnostics…** to verify the observer is attached.

**No Node.js installation is required** to build/use the app; CI runs JavaScript regression tests. This PR remains draft until macOS CI and actual tests are complete.

## Observed results — 2026-11-04

Real-device tests after PR #3:

- Messenger mobile shows **one** call-history entry when the desktop view has two.
- With Messenger Native **alone**, incoming calls do not create Now Playing.
- Facebook Web in the browser **alone** can create Now Playing; with both clients running, it also appears.
- Ghost ringtone persists in **the browser tab**, not in Messenger Native. Messenger Native's **Stop Ringing Now** does not and cannot stop audio from Edge; the user has had to reload the Facebook tab.
- Native Call Diagnostics after the call: `Active=false`, `Started=2`, `Stopped=2`, `suppressedWebRingtones=2`, `Duplicate call popups blocked=0`, `observerAttached=true`, `incomingDialogActive=false`.
- These counters show the native ringtone lifecycle ended normally. The double-entry cause remains unproven: one mobile entry reduces the evidence for account-wide duplicated records but does not distinguish local duplicate rendering from two desktop-client call events.

### Safe containment and investigation

1. **Do not attempt to control the Edge/Facebook ringtone from the native app.** Different processes/browsing contexts do not share a media-control API.
2. To interrupt the browser-side stuck ringtone without refreshing the chat, **mute the Facebook tab** using the Edge tab's speaker icon or right-click `Mute tab`. This silences the output but does not clear a stale call session; reload may still be needed to reset it.
3. In Edge, use `edge://media-internals` and DevTools → **Media** to inspect the browser tab's active media player. Do not share full logs without redacting names/URLs/tokens.
4. Keep the browser's Facebook/Messenger call-receiving session closed for reliability-critical calls while using Messenger Native; merely muting notifications is not equivalent to ending the session.
5. Avoid deduplicating or hiding call-history UI based on timestamp; two actual calls can legitimately occur in one minute.
6. Preserve PR #3's native ringtone fix and mobile privacy settings. The new PR #4 does not attempt to fix behavior in an external browser.


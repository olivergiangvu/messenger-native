# Incoming call ringtone + duplicate popup safeguard (experimental)

Branch: `feature/call-ringtone-lifecycle`. Based on working native notification / Reel branch; does not change message notification delivery.

## Reported failure

On macOS, an incoming Messenger call still creates an unwanted **Now Playing** entry (2-second clip), can leave a "ghost" ringtone running after the call ends, and may produce two call entries per attempt.

The old `jsThongBao` intercepted only the incoming-message `XFhtdTsftOC.ogg` file, while allowing the confirmed incoming-call `taJw7SpZVz2.mp3` file to play through WebKit. When the modal disappeared, it tried to pause **all** active <audio> elements at 1.5, 3 and 6 seconds. This was unsafe for voice notes and still didn't guard against late/repeated play() calls.

## Changes

- A separate `incoming-call-audio.js` intercepts the **known incoming-call ringtone** (only in the Messenger chat main frame, not inside `/groupcall/`). It prevents HTMLMediaElement.play() from starting a WebKit media session for that file.
- Native `IncomingCallRinger.swift` uses a non-looping macOS NSSound repeated at a bounded interval, stopping on explicit decline/accept, modal closure, call-window opening, app termination, loss of incoming-dialog heartbeat, or a **hard 55-second cutoff**. It has no indefinite `loops=true`.
- Each call modal has an opaque session token, which ensures a **late callback from an already-ended call cannot restart the ringtone**. The call dialog disappearance is debounced to avoid treating brief React re-renders as distinct calls.
- The unsafe "pause every audio" cleanup is deleted; user voice messages, regular videos and Reels are untouched.
- `createWebViewWith` checks for an already visible popup using the same `/groupcall/` URL path and declines a duplicate `window.open`. Per WebKit requirements, it does **not** return a previously created WebView.
- `Xem → Call Diagnostics…` shows native ringtone counters, suppressed WebKit ringtone count, active call-window count and duplicate popups blocked.
- `Xem → Stop Ringing Now` is an emergency button, silencing the native ringtone and pausing *only* the recognized ringtone HTML audio elements.

## Important limits

The duplicate-popup safeguard can prevent **one local cause** of duplicate calls. If the actual Messenger conversation history contains duplicate server-side call records, this code cannot remove or prove the cause without additional evidence. It does not suppress distinct calls or blindly deduplicate all windows.

The known call ringtone file may change when Meta updates Messenger. Unknown audio sources are not suppressed, to avoid breaking real voice calls. If Now Playing persists, collect its filename from the app's existing debugging log and the Call Diagnostics status; do not block all HTMLMediaElement playback.

## macOS test instructions

Quit Messenger Native with Cmd+Q before rebuilding.

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/call-ringtone-lifecycle
bash build.sh
bash install-local.sh
```

If the branch already exists locally, use `git switch feature/call-ringtone-lifecycle && git pull --ff-only` instead.

**No need to install Node.js.** GitHub Actions will run `Tests/IncomingCallAudioTests.cjs` and compile the whole AppKit application on macOS.

Test with two devices/accounts in this order:

1. Receive one call, then **decline** on the chat's call dialog. Confirm ringtone stops and Now Playing does not appear.
2. Receive one call, **accept** and verify active call voice/video works. End the call; the ringtone must remain stopped.
3. Receive one call and have the caller **hang up** without any action from you. Ring must stop within a couple of seconds.
4. Call again immediately after one completed call to check a new session rings, while old events cannot restart.
5. Verify no extra WebKit call windows. Compare Call Diagnostics duplicate-window counter with Messenger's call log: server-side duplicate history and local duplicate popup are distinct problems.
6. Play a voice note and a Reel and send a message notification. Neither should be affected.

## Diagnostics

Open `Xem → Call Diagnostics…` after each call. Useful fields:
- `Started` / `Stopped`
- `Web ringtone events`
- `Duplicate events`
- `Duplicate call popups blocked`
- `Audio bridge: installed=true, suppressedWebRingtones=N`

If a ghost ringtone occurs during testing, click **Xem → Stop Ringing Now**. If it cannot be stopped, quit the app with Cmd+Q and collect the audio filename in logs; the sound may be from a different file/source.

# Now Playing source isolation (read-only, 2026-11-04)

## Why this test matters

The user observed the Now Playing artwork as Facebook and the text "Trinh is calling" while **Facebook was also open in a normal browser**. This is *not sufficient* to attribute the Now Playing session to Messenger Native. Both the native app's WKWebView and the independent browser can publish Media Session metadata to macOS.

The original call-ringtone/duplicate-history fix is now **working in real testing**. Do not alter or disable that behavior without an isolated reproduction.

A speculative write-interceptor for `navigator.mediaSession.metadata` was deliberately removed from this branch. The diagnostic now **reads** WebKit's own Media Session metadata/playbackState, reporting only a boolean title classification, never the caller's name.

## Controlled A/B test

Between tests end the call and allow Now Playing to return to an inactive/previous state. Always distinguish the *arrival of a new call entry* from a stale retained card.

| Test | Messenger Native | Browser Facebook/Messenger tab | Observation |
|---|---|---|---|
| A — native-only | Open, installed version | All Facebook/Messenger browsers and PWA instances QUIT (Cmd+Q, not just close window) | Incoming call: does a NEW "X is calling" Now Playing card appear? |
| B — browser-only | Quit with Cmd+Q | Browser Facebook/Messenger open | Incoming call: does a similar card appear? |
| C — both (if needed) | Open | Browser Facebook/Messenger open | Reproduce only after the two isolated tests |

Avoid unrelated music/video during each call. Don't delete account data or disconnect logged-in devices.

**Interpretation**:
- A=no, B=yes: browser is the likely origin; fixing Messenger Native's WebKit cannot prevent the browser's Now Playing.
- A=yes, B=no: Messenger Native WKWebView likely produces the Now Playing session.
- A=yes, B=yes: both independent clients can register media sessions; the issue is not unique to the native app.
- A=no, B=no, C=yes: investigate coexistence and competing media clients rather than muting all call audio.

## In-app read-only diagnostics

Open `Xem > Call Diagnostics…` *while the inbound call modal is visible* and after the call ends.

Version `1.3-readonly-origin` reports:
- `suppressedWebRingtones`: the count of known mp3 ringtones suppressed in the **main WKWebView only**.
- `mediaSessionAvailable`: whether `navigator.mediaSession` exists in the main WKWebView.
- `mediaSessionCallTitle`: boolean whether its current title resembles "is calling"; **the title and person's name are not shown or recorded**.
- `mediaSessionPlaybackState`: `none` / `playing` / `paused` as reported by Messenger Native's main WKWebView.
- Native `Started`/`Stopped` and `Duplicate call popups blocked`.

If `mediaSessionCallTitle=true` in Test A while a new Now Playing call entry appears, it supports a local WebKit Media Session cause. A `false` result does **not** completely rule out media from a nested frame or another WebKit process.

## Edge browser diagnostics (optional)

While Edge is running with Facebook open:
1. Visit `edge://media-internals` in another Edge tab.
2. Reproduce an incoming call while Messenger Native is QUIT.
3. Inspect active/recent player entries and events for Facebook.
4. For the Facebook tab, DevTools > More Tools > Media provides per-tab player details.
5. `edge://webrtc-internals` may help with an active WebRTC call but absence of an entry during *ringing* does not prove there is no Media Session.

Do not share raw internal pages or media logs without removing profile paths, conversation URLs, IDs, tokenized links, names and other private data. Summary counters and yes/no source attribution are enough.

## Do not use speculative workarounds before A/B

Do not set `navigator.mediaSession.metadata=null` globally, turn off Now Playing for the entire WebKit process, block all HTMLMediaElement.play(), or forcibly pause voice/video: those actions can break real calls, Reel playback and voice notes.

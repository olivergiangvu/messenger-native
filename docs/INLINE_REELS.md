# Native link routing and inline Facebook Reels (experimental)

## Product behavior

- Ordinary Facebook posts, pages, profiles and external websites open in macOS's default browser via `NSWorkspace`.
- Messenger conversation navigation and sign-in remain inside the main `WKWebView`.
- Voice/video calls keep their existing popup/PiP flow.
- Clicking an image thumbnail linking to a **public Facebook Reel** attempts to embed its player in the **same Messenger chat DOM**, without creating another WKWebView or a standalone popup.
- A Reel's text link and the inline player's **Open in browser** action use the system browser.
- Attachments and FB CDN downloads retain the original download handling.

## Implementation

- `Ma nguon/LinkRouting.swift`: Foundation-only URL routing policy shared by WKNavigationDelegate and WKUIDelegate.
- `Ma nguon/reel-preview.js`: conservative click interceptor for Reel thumbnails. Uses Meta's public embedded-video player. Does not scrape raw media or bypass privacy restrictions.
- `build.sh`: compiles LinkRouting.swift and copies the JavaScript into the application bundle.
- `Tests/LinkRoutingTests.swift`: routing assertions, runnable using `swiftc`.

## Run routing tests

```bash
swiftc 'Ma nguon/LinkRouting.swift' 'Tests/LinkRoutingTests.swift' -o /tmp/messenger-link-tests
/tmp/messenger-link-tests
```

## Test on macOS

1. Open a normal Facebook post thumbnail and a plain post link: both should open the default browser.
2. Open a public Reel thumbnail: inline player should appear in the chat bubble; closing it restores the thumbnail.
3. Use the player fallback link: it should open the default browser.
4. Try a private/friends-only Reel: expect embed restrictions; open it in the browser instead.
5. Verify ordinary internal Messenger chat navigation, login/2FA, file downloads and voice/video calls still work.
6. Try a link that launches `window.open('about:blank')` before redirecting. The existing popup logic remains for these flows and needs separate regression testing.

## Known limitations / safety

- This is a **prototype**, not a verified reproduction of the retired native Messenger app's Reel player.
- Meta can change the preview DOM; previews without clickable `<img>`/`<video>`/picture elements may fall back to external browser.
- Public embeds may fail because of content permissions, frame/CSP restrictions or browser playback rules. The player always exposes an external-browser fallback.
- Starting a Reel may legitimately create a Now Playing session. The separate notification-sound bug must be fixed without disabling real video playback.
- Neither a successful JavaScript syntax check nor Foundation-only Swift tests demonstrate successful macOS app compilation or actual Reel playback.
- The existing `about:blank` new-window behavior is not fully redesigned here, to avoid breaking the call flow without end-to-end tests.

This work is based on the `v0.6.1` MIT-licensed code. The upstream attribution/license must be retained.

## Independent fork identity

This feature branch also changes the test app to **Messenger Native.app** with bundle ID
`com.olivergiangvu.messengernative`, fork version `0.1.0`, and the update repository
`olivergiangvu/messenger-native`. This prevents replacing the original Messenger Vdk app.
A different bundle ID has its own WebKit storage; logging in again is expected.

Do not use in-app updates until a new independent release-signing key and signed
fork release pipeline are configured. The original embedded verification key is
not a release key for this fork.

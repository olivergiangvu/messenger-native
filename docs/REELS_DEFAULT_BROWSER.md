# Facebook Reels: always open in the default browser

## User request (2026-11-05)

After testing the embedded player for some time, the user wants a simpler,
consistent experience: opening **any Facebook Reel from Messenger Native**
should hand off to the default browser, instead of embedding or playing
the Reel inside Messenger Native.

## Existing behavior and cause

The previous `reel-preview.js` intercepted a Reel click and inserted
`facebook.com/plugins/video.php` as an autoplay iframe directly
beside/inside the message. The native `moReelTrongHoiThoai` fallback
could also request the inline player.

This did not match the requested current Facebook mobile-web behavior.

## Updated routing policy

- Leave Messenger's own **original thumbnail, preview card and surrounding
  chat UI completely intact**. Do not hide/reparent/replace the card.
- For a recognized Facebook Reel click, prevent Messenger's in-app
  navigation and send the target to Swift via the existing
  `vmThongBao` message handler. Swift validates trusted Facebook video
  routes, then calls `NSWorkspace.shared.open` with the destination.
- Support numeric `/reel/<id>`, `/reels/<id>` and Facebook link
  wrappers (`l.facebook.com/l.php?u=...`).
- Also support opaque `facebook.com/share/r/<token>`,
  `facebook.com/share/v/<token>`, `facebook.com/watch/?v=...`,
  Facebook `.../videos/<id>`, and `fb.watch/<token>`. Opaque
  sharing URLs retain their native destination; do **not** invent an
  underlying numeric Reel ID.
- Main-frame WebKit navigations or `window.open` popups resolving to
  trusted Facebook video URLs are intercepted by native routing, too.
- Avoid duplicate browser tabs if one gesture triggers both JS click
  and native popup/navigation callbacks within 1.25 seconds.
- **No iframe, injected video player, autoplay, or extra playback
  WKWebView** is created by this feature.
- The existing `Reel Diagnostics` now reports
  `version: 3.0-external-only`, `playerVisible: false`, number of
  external requests, and native duplicate browser handoffs blocked.

## What is not changed

- Messenger's own previews/thumbnails and **non-Reel attachment video**
  playback are not intentionally intercepted. This feature matches
  recognized first-party Facebook video URLs, not arbitrary video files.
- Authentication/2FA URLs are untouched.
- Messenger voice/video calls, group-call windows, native ringtone,
  notification delivery/deduplication, Notification Center history,
  background service, Dock unread badge, BTT Stage Manager and macOS
  language localization are unchanged.
- No user-agent spoofing, app-specific URL scheme or private Facebook
  deeplink is introduced.

## Browser / Facebook app behavior

On macOS `NSWorkspace.shared.open(URL)` hands the destination to the
**default browser or registered handler**. Unlike iOS or Android, the
Messenger wrapper cannot guarantee that Facebook will launch a
Facebook-native application from a normal HTTPS URL. If the user's
browser or system has an appropriate registered app handoff, it
controls the next step.

The goal is always to leave the Messenger Native WebKit, not to
force-open an unverified third-party app or browser.

## Real Mac acceptance

1. Install branch `feature/reels-default-browser`.
2. In a Messenger conversation, click a Reel thumbnail/card: the default
   browser opens the Reel, and Messenger Native's original thumbnail remains.
3. Click an ordinary Reel text link and tracked/redirected link: same result.
4. Try `share/r`, `share/v` and `fb.watch` video links: these should
   also use the browser. They may redirect to Facebook login depending on
   the user's browser session.
5. Double-check that a single click opens **one** browser tab.
6. Click an ordinary photo, Messenger-hosted video attachment and call
   button: none should be intercepted by the Reel external router.
7. Verify no new iframe/media player appears in the chat. Open
   View → Reel Diagnostics to confirm `3.0-external-only`.
8. Verify two accepted incoming message notifications from a chat are
   individually retained in Notification Center, subject to macOS grouping,
   and native notification click still opens the correct chat without reload.

## Install

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/reels-default-browser
bash build.sh
bash install-local.sh
```

If local branch exists: switch it, pull --ff-only, then rebuild.

This branch is stacked on `feature/notification-center-history` (PR #15);
a single test install includes both the Notification Center history fix
and the external-only Reel behavior.

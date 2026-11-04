# Native notification tap → Messenger chat (no forced page reload)

## Field result and correction — 2026-11-04

The first PR #7 implementation forcibly called `WKWebView.load(URLRequest(...))`
when the notification targeted another conversation and `WKWebView.reload()`
when it targeted the current conversation. The user reports seeing the page
reload when pressing the notification: **this is undesirable behavior caused
by that implementation**, not an indication that the original no-reload
requirement was met.

That approach is superseded within this same draft PR.

## New behavior

1. The system notification still retains a validated `/t/<thread>` path in
   `UNNotificationContent.userInfo`.
2. When clicked, bring Messenger Native's main window to the foreground.
3. After a short **250 ms activation delay**, run the bundled
   `notification-navigation.js` module in the existing WKWebView document.
4. If the target conversation is already displayed, return without a reload.
5. Otherwise, find the existing conversation link inside Messenger's page
   and use its own click handler to open the chat as an in-page transition.
6. If the web page needs time to resume and render chat rows, retry for up to
   **7 attempts**, with **320 ms** between attempts. A newer notification tap
   cancels pending retries for an earlier tap.
7. If Messenger never exposes the target conversation link, report
   `not-opened` in the read-only in-page diagnostic status. **Do not
   automatically reload**, force a full navigation or invent a router route.
   The user can retry after the page resumes, or reload manually as a
   last resort.

## Why this strategy

`WKWebView.load`, `reload`, `location.href`, and synthetic
`history.pushState` are intentionally excluded from the notification click
path. A forced reload can visibly interrupt the user and discard an unsent
draft. Manually manipulating browser history can also change the URL
without updating Messenger's actual React chat state.

The only available public integration point in the current web wrapper
is the conversation link already provided by Messenger, with a short
wake-up delay and bounded retry mechanism.

## Test plan on the user's Mac

1. Update the `feature/notification-deeplink` branch and build/install.
2. With Messenger Native open but **behind another app**, send a message
   from a different account and click the native macOS banner.
3. Verify it raises the existing window and transitions **without the
   whole Messenger page flashing or reloading**.
4. Repeat with the target conversation already open, then a chat not currently
   selected, and then the main window minimized or in another Stage Manager set.
5. Leave the app in background for 5+ minutes and repeat. If the target
   is not in the rendered chat list, the attempt may report `not-opened`
   without forcing a reload.
6. Do not accept the fix on CI status alone: this needs a real Messenger Web
   session and notification-click tests.

On the main page, DevTools may evaluate:
```javascript
window.__mnNotificationNavigation?.status()
```
which returns only the navigation state and attempt count (no conversation
or message IDs).

## Build and install

```bash
cd ~/messenger-native
git fetch origin
git switch feature/notification-deeplink
git pull --ff-only origin feature/notification-deeplink
bash build.sh
bash install-local.sh
```

If the branch is not present yet:
`git switch --track origin/feature/notification-deeplink`.

## Scope

This changes only notification tap navigation; there is no change to
notification detection, native notification content, call ringtone,
Reel behavior, BetterTouchTool/Stage Manager, localization or WebKit
resource settings.

The app's notification engine remains best-effort while backgrounded;
the new navigation code does not turn it into Web Push.

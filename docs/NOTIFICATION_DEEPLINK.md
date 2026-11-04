# Reliable notification tap → open correct Messenger conversation

## Reported problem

Notifications appear when Messenger Native is in the background, but tapping a
macOS banner sometimes only foregrounds the app. The user then has to reload the
page once before the relevant conversation appears.

## Cause found in the original implementation

The native notification stores a stable Messenger conversation path in
`UNNotificationContent.userInfo["mnConversationPath"]`.

But the tap handler **does not use that first**. Instead, it:
1. Invokes the webpage's old `Notification.onclick` closure if one exists.
2. Or programmatically performs `link.click()` on an existing conversation row.
3. Only falls back to `location.href = ...` when the target anchor is missing.

Both steps 1–2 return success immediately, without checking that Messenger's
React router actually rendered the requested conversation. After a long period
backgrounded, a synthetic DOM click may not result in the intended route.

This is the likely mechanism, not a fully proven cause before macOS testing.

## Change

- When a user taps a regular macOS notification, foreground/deminiaturize the
  Messenger Native main window.
- Validate the saved conversation path using a Foundation-only
  `NotificationDeepLink` function. Never load untrusted external domains.
- When the target is a *different chat*, call
  `WKWebView.load(URLRequest(url: trustedMessengerURL))` directly; do not rely
  on web page `onclick`, a visible DOM row, or a JavaScript synthetic click.
- If the notification targets the *currently loaded chat*, call
  `WKWebView.reload()` to refresh messages after possible background page
  suspension.
- Notification taps without a valid conversation path (such as old test
  notifications) use the legacy webpage `Notification.onclick` fallback only.
- Respect default tap action; ignore dismiss/other actions.
- Do not alter notification detection, banners, content formatting, call sound,
  Stage Manager, localization, or Reels.

### Trade-off

This prioritizes **reliability over SPA navigation speed**: opening a different
conversation forces a first-party WKWebView document navigation. It can be slower
than Meta's in-page router, and a draft typed in another chat may be lost when
the page is reloaded. Do not describe this as zero-reload SPA navigation. The
goal is that the user needs **no additional manual reload** and reaches the
correct conversation after one click.

## Test plan (real macOS)

1. Install from `feature/notification-deeplink` without changing the app
   bundle identifier, so macOS notification authorization and login survive.
2. Leave Messenger Native running, switch to Safari/Finder, send a message from
   another account/device. Click its banner. The target conversation should
   open without a manual ⌘R.
3. Repeat with a chat that isn't currently selected; then with a notification
   from the already selected chat (should reload it once).
4. Repeat after leaving the app backgrounded at least 5 minutes and with the
   main window minimized (plus a Stage Manager workspace).
5. Verify clicking an old test notification with no stored thread path merely
   opens the app and doesn't navigate to arbitrary URLs.
6. Confirm notification content, audible sound, Reels, calls and
   BetterTouchTool Stage Manager shortcuts still work.
7. If a target chat fails to open, check native logs for the **generic**
   "MN NOTI: ... navigation" entries (they do not include chat IDs) and report
   whether the app's address/chat route changed.

## Build

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/notification-deeplink
bash build.sh
bash install-local.sh
```

If the branch already exists, switch and pull it before building.

## Limitations

- Native navigation is only possible if the notification contains a valid
  `/t/<id>` route. Legacy/test banners may have no route.
- The latest Facebook/Messenger Web route behavior still depends on Meta.
- The notification engine is a best-effort DOM fallback; it is not Web Push.
- A successful macOS CI build does not prove all background-to-foreground
  timing cases; a live banner-click test is required.

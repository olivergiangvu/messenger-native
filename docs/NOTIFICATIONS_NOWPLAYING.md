# Notification & Now Playing Core Fix (experimental)

This branch is based on `feature/link-routing-reels`, preserving the working Reel behavior and the independent Messenger Native bundle ID.

## Architecture

1. `notification-engine.js` observes the rendered Messenger conversation list via MutationObserver, with a 3.5-second fallback scan. Initial existing unread rows only establish a baseline. The engine tracks ongoing changes even while Messenger is focused, so the first real incoming message immediately after switching away is **not** silently discarded.
2. All detected changes enter a bounded queue. There is no legacy "first three messages only" cap. A queue overload is explicitly logged.
3. `NativeNotificationCoordinator.swift` constructs macOS notifications with title, subtitle (group sender where visible), body, thread identifier, default macOS sound and an optional stable conversation path for click-to-open. Brief cross-source duplicates are suppressed, while repeated messages *from the same source* are not automatically collapsed.
4. The known incoming-message chime `XFhtdTsftOC.ogg` is intercepted before WebKit's `HTMLMediaElement.play()` call. In the foreground, AppKit's `NSSound` provides a short local sound; in the background, a system notification controls its own sound. Incoming call ringtone `taJw7SpZVz2.mp3`, voice messages, video and Reel playback are not intercepted.
5. Notification callbacks are no longer mapped to a long-lived dictionary retaining WKWebView objects. Notification taps can open the originating conversation from a stored `/t/...` path after a page reload.

## Confirmed improvements in source logic

- Removes the legacy 15-second startup skip and the first-blur skip.
- Removes the hard-coded three-notification cap.
- Tracks up to 75 rendered conversation rows instead of only 15.
- Bounds snapshots and pending notification storage.
- Improves group title/sender preview when Messenger renders a sender prefix.
- Adds native diagnostics and a synthetic test notification.

## Known limitations

**WKWebView is not equivalent to a browser with working persistent Web Push.** If the process is suspended or Messenger doesn't render an updated conversation row, this fallback cannot know a new message arrived. The same text sent twice without a distinct DOM identifier may be indistinguishable. Virtualized rows/off-screen messages may not be observed. There is no guarantee of 100% delivery, full message preview, or every group sender. Notification layout, Focus, sound, and previews also depend on macOS settings.

The `XFhtdTsftOC.ogg` file identity was observed in the upstream application. Meta can rename the sound file; if that happens, the Now Playing issue may return without affecting message detection. Playback of legitimate audio/video should remain unaffected.

NotificationEngine suppresses notifications while the Messenger web document has focus, but keeps snapshots current.

## Build and test on the Mac

Quit all Messenger Native instances before rebuilding (the fork has a single-instance guard).

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/notification-nowplaying
# If branch already exists: git switch feature/notification-nowplaying && git pull --ff-only
swiftc "Ma nguon/LinkRouting.swift" "Tests/LinkRoutingTests.swift" -o /tmp/mn-router
/tmp/mn-router
bash build.sh
open "$TMPDIR/messenger-native-build/Messenger Native.app"
```

The GitHub macOS CI workflow also runs `node Tests/NotificationEngineTests.cjs`. Installing Node.js locally is optional and not needed to use the app.

## Critical macOS permission fix (2026-11-04)

If diagnostics show:

- `Permission: Not requested`
- `Alert style: 0`, `Sound allowed: no`
- `Submitted: 0`, `Errors: 2`

...then the native request is being **rejected before the system has recorded a permission choice**. The app is not merely hidden by Focus. Launching a test .app directly from `$TMPDIR` (typically `/var/folders/.../T/`) can cause `UNErrorDomain code 1` due to application registration/identity. This is an evidence-based likely cause; inspect the actual error domain and code before assuming this is the only cause.

The supported development flow is now:

```bash
cd ~/messenger-native
git fetch origin
git switch feature/notification-nowplaying
git pull --ff-only origin feature/notification-nowplaying
bash build.sh
bash install-local.sh
```

The installer verifies the code signature, copies the built app to **~/Applications/Messenger Native.app**, registers it using the system LaunchServices `lsregister`, and opens **that installed copy**. It does not reset cookies, remove user data or change the bundle ID. It does not require `sudo`.

Do **not** open the development app directly from `$TMPDIR` while verifying notification permission. If an old instance is running, quit with ⌘Q before starting the installer.

In the installed app, select **Xem → Request Notification Permission…**. Accept macOS's notification dialog if it appears, then select **Xem → Send Test Notification…**. Open **Xem → Notification Diagnostics…** and check:

- Permission should be `Allowed` (or explicitly `DENIED` if rejected)
- Installed path should be `/Users/<user>/Applications/Messenger Native.app`
- `Submitted` should increase and `Last submission error` should be `none`

If it still shows `Not requested`, the diagnostics now include **Last permission request** (error domain and numeric code) plus the last request-submission failure. A signed certificate may need to be configured if the ad-hoc signature is not accepted on the specific Mac configuration. Do not reset macOS notification databases or TCC arbitrarily.

**Separate issue:** A status of `lastEvent: rows-no-chat-links` means the DOM fallback is presently unable to locate rendered conversation anchors. Once permission works, test real incoming messages while Messenger's chat list is visible. This is not evidence of an OS notification permission error and may require adjusting DOM selectors to the current Messenger UI.

## Check native notification permission first

In Messenger Native:

- `Xem → Send Test Notification…`: creates a real local notification, without Messenger messages.
- `Xem → Notification Diagnostics…`: shows macOS authorization, alert style, sound, NotificationEngine status, submitted requests and intercepted web message chimes.

A request being submitted is **not proof** that macOS displayed a banner. Check System Settings → Notifications → Messenger Native and Focus modes.

## Acceptance tests

1. **Baseline**: open app with old unread chats; no flood of stale notifications.
2. **Background**: focus another app, send one new message from another account/device; one notification should appear.
3. **Immediate switch**: focus another app and send a message immediately; it must not be discarded by a first-blur rule.
4. **Burst**: generate four or five new messages across chats; confirm no three-item truncation.
5. **Group**: if preview says "Minh: Đã gửi file", expect Group title + "Minh" subtitle + message body.
6. **Deep link**: click a notification, then try again after a Messenger reload; it should navigate to the right conversation if the payload contains a valid path.
7. **Now Playing**: with no music playing, send a message. The notification audio must not create a Now Playing session. Use Notification Diagnostics to verify the intercepted-chime counter increases.
8. **Regression**: voice note playback, inbound call ringing/accept/decline, Reel playback and inline `share/v` must still work.

Please report `Notification Diagnostics` status if any case fails. It does **not** log private message text.

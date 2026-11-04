# Consistent notifications in all Messenger Native window states

## User report (2026-11-05)

The DOM fallback suppresses notifications whenever `document.hidden === false`
and `document.hasFocus() === true`. This means a new message in the same
conversation can generate a macOS notification while Messenger Native is
backgrounded, but **not when its window is focused or merely visible**.
This is an inconsistent user experience.

The macOS native `UNUserNotificationCenterDelegate.willPresent` already
requests `.banner, .sound, .list` when foregrounded. The primary gate was
the JavaScript detection policy, not macOS presentation.

## New policy

Detect a changed **incoming** conversation preview regardless of window
focus, visibility, minimization or Stage Manager grouping:

| Running app state | Expected detection |
|---|---|
| Foreground / focused, another chat has a new unread message | Yes |
| Visible but not focused, another chat receives a new message | Yes |
| Minimized or Stage Manager backgrounded | Yes, if WKWebView keeps running |
| Currently selected conversation, auto-marked as read | Yes, if its preview changes |
| App fully quit | No: no Web Push service in this fork |
| macOS sleeping / WebKit suspended | Best effort only; events may be delayed/missed |

The detection remains based on Messenger's *rendered conversation list*;
there is no access to Meta's authoritative server event stream.

## Rules to avoid nuisance alerts

- Silent baseline: initial load does not notify for old messages.
- A read/unread flag change **alone** does not represent a new message.
- Newly visible chats exposed only by scrolling are not treated as new
  messages unless there is a known previous preview.
- An explicitly outgoing first-person preview (e.g. `You:`, `Bạn:`,
  `You sent` or `Bạn đã gửi`) is ignored, including in the open chat.
- For the currently selected chat, a changed preview can qualify even when
  the unread marker is already gone.
- React/DOM observer is primary; a 3.5-second timer remains the fallback.

**Limitation:** Messenger Web may not label all outgoing messages
consistently, and repeated identical preview strings may look unchanged.
This code cannot promise perfect sender identification, zero false
positives, or 100% notification delivery. Further hardening needs live
DOM examples, not guesses.

## Native sound UX

The app previously played an extra AppKit `Tink` while active when it
intercepted Messenger's web message sound. That can overlap with the
macOS native banner's default sound.

The updated behavior suppresses the web-origin sound and lets native
`UNNotificationContent.sound = .default` handle both focused and
background cases. macOS Focus, user notification authorization and per-app
settings still decide whether the sound/banner is actually presented.

## Settings / localization

The preference now says **Thông báo tin nhắn mới / New message notifications**,
rather than **Thông báo tin nhắn khi ứng dụng chạy nền**. The help copy states
that the setting covers focused, visible and backgrounded windows; it
also states the WebKit/quit limitations. English and Vietnamese translations
are bundled. No separate language switch is introduced.

## Privacy-safe diagnostics

`window.__mnNotificationStatus()` adds:

- `foregroundSent`: DOM notifications sent when window was focused
- `selectedChatSent`: notifications from the currently selected chat
- `selfMessageSkipped`: outgoing-preview candidates suppressed

These are counters only; no chat IDs, contact names or message text are
logged or returned.

## Acceptance test on a real Mac

1. Update the feature branch, fully quit the old app, then build/install.
2. Keep Messenger Native focused **on another conversation**. Send an
   inbound message from a second device/account. Verify native macOS
   notification and preview appear.
3. Keep the **same conversation** selected and receive a new message.
   It may immediately be marked read, but a changed preview should
   still generate the native notification.
4. Move to Safari while leaving Messenger Native visible; receive a new
   message and verify a banner.
5. Minimize Messenger Native or move it into another Stage Manager set;
   receive a new message and verify a banner, then click to open chat
   without a WebKit reload.
6. Send an outgoing `You:` / `Bạn:` marked message from the active
   conversation and verify it does **not** notify. Send the same
   text as a genuine inbound message, where the sender is detectable,
   and report any mistaken suppression.
7. Verify notification sound is not doubled on foreground delivery.
8. Confirm Unicode emoji in preview and clean `Unread message` labels.
9. Test macOS Focus on/off: Focus policy may deliberately mute/hide
   banners; the app cannot override it.
10. Open Web Inspector console and run
    `window.__mnNotificationStatus()` for counters if behavior fails.

## Install

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/notification-all-window-states
bash build.sh
bash install-local.sh
```

If the branch is already present locally, use
`git switch feature/notification-all-window-states` and
`git pull --ff-only origin feature/notification-all-window-states`.

This branch is based on `feature/notification-emoji-preview` (PR #10).
Notification click-to-chat no-reload, stage-manager/BTT, call management
and Reels remain unchanged.

# Fix: conversation relative-time updates masquerading as new messages (2026-11-05)

## Observed regression

In the user's macOS screenshot at 13:33, a **single** message preview
("Đăng: https://vt.tiktok.com/ZSpYe68xL/") from Bnn produced six native
notification cards. The **bodies** were different only because Messenger
appended its changing UI age: "1m", "2m", "3m", "4m", "5m", "6m". The separate
macOS "1m ago", "2m ago" labels confirm these are new notification deliveries
over several minutes, not merely six accumulated distinct messages.

## Root cause

`notification-engine.js` only excluded standalone metadata lines
(`metadata(part)`). The Web UI can render the relative timestamp on the
**same** text line as the last-message preview. That dynamic age became part
of the parsed `preview`, and consequently of the change `signature`.

Each minute:

```
Bnn | Đăng: https://vt.tiktok.com/.../ 1m
Bnn | Đăng: https://vt.tiktok.com/.../ 2m
...
```

The DOM engine interpreted the changed signature as a fresh unread message.
Native `NotificationDeduplicator` cannot reject it as an identical preview
because the body changed each time. Retaining per-event request IDs in PR #15
correctly preserves legitimate message history but made this bug visible.

## Fix

1. If an appended relative-age suffix has its **own leaf DOM element**
   (a timestamp-like span/time/abbr), remove just that UI age from the
   parsed message preview. This keeps genuine user message text intact.
2. For flatter Messenger DOM layouts with no identifiable timestamp leaf,
   recognize monotonically increasing age **only when the remaining preview
   and sender are unchanged**. Suppress this UI-only change before enqueueing.
   A different message body is still eligible immediately.
3. Expose privacy-safe `relativeTimeChangesBlocked` and
   `inlineTimestampsRemoved` diagnostics.
4. Add JS regressions for the exact TikTok message and six minute steps,
   incoming messages with a new URL, flat DOM without timestamp nodes,
   and legitimate message text ending in "5m".

### Known limitation

Without message IDs from Meta, it is impossible to perfectly distinguish
two real subsequent messages whose text differs **only** by an increasing
short time suffix (`Hello 1m`, `Hello 2m`) from a UI timestamp that has
been flattened into the same DOM text node. The safer choice here is to
suppress the much more common false repeat. Messages with a different
text prefix remain eligible.

## Scope

Based on PR #16's head (which includes PR #15 Notification Center history).
Only `notification-engine.js` and its JS tests change. No changes to
macOS notification history/card IDs, native formatting, deeplinks,
dedup timing, Dock badge, Reels browser routing, calls, BTT or localization.

## Real Mac acceptance

- Install the feature branch and fully relaunch the app.
- A stale unread Bnn chat should not alert once per minute when its
  "1m" -> "2m" -> ... age ticks.
- A genuinely new message must alert once and show the original message
  text without the timestamp if a separate timestamp leaf exists.
- Multiple distinct accepted messages must retain separate Notification
  Center cards, grouped according to macOS settings.
- Verify diagnostics from View > Notification Diagnostics to see whether
  suppression uses isolated-node stripping or age-only fallback.
- The installed build must be checked on the actual Mac. CI cannot
  reproduce Meta's live production DOM completely.

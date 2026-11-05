# Restore notification history in macOS Notification Center

## Field feedback (2026-11-05)

The user confirms actual incoming notifications have become substantially
more accurate, but only the latest card remains visible in Notification Center
for a conversation instead of the previous message history/stack.

## Root cause

PR #14 changed the native `UNNotificationRequest.identifier` from an
individual message-event ID to a **stable per-conversation ID** such as
`mn-chat:/t/123`. A second accepted message therefore *replaced* the
previous card, removing history.

**This is not message deduplication.** The existing notification engine
and `NotificationDeduplicator` already suppress false/stale/duplicate
events before a request reaches macOS.

## Fix

- Use each accepted Web or DOM notification's already-unique event ID
  (`vm-<timestamp>-<random>` and `mn-<timestamp>-<sequence>`).
- Keep `UNMutableNotificationContent.threadIdentifier = /t/<id>` so
  Notification Center can group multiple cards from the same conversation.
  Whether cards visually group/stack depends on the user's macOS
  **System Settings → Notifications → Messenger Native → Notification grouping**.
  The app cannot force Notification Center's presentation preference.
- Preserve each card's `mnConversationPath` for click-to-chat navigation,
  including the validated no-reload flow.
- Preserve current generic-status filtering, 10-minute repeated-preview
  suppression, background-to-focus dedup, draft/self-send filters,
  emoji restoration, foreground notifications, and rendered-chat Dock badge.
- Remove the now misleading `Thread cards replaced` diagnostic metric.
  Keep source-specific and no-thread counters.

## Acceptance test

1. Completely quit the installed app, install this feature branch.
2. Existing cards may have been replaced by earlier versions and cannot
   be restored retroactively.
3. Have another account send TWO **different** messages to the same chat,
   separated enough for distinct preview changes.
4. Verify two accepted native notification requests are retained
   (not replaced) in Notification Center.
5. Another conversation should have its own history; click an earlier card
   to open the corresponding conversation without reloading the WebKit page.
6. If cards do not visually stack, check macOS Notification grouping setting
   rather than changing the notification ID again.
7. Verify redundant "Unread message", old previews, drafts and self-sent
   messages still do not create extra cards.

This branch is based on `feature/notification-event-freshness` (PR #14)
and intentionally changes ONLY presentation/history.

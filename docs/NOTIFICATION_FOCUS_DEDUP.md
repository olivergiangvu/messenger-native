# Background-to-focus duplicate notification regression

## User report (2026-11-05)

In a real macOS screenshot, Notification Center showed multiple notifications
from one Messenger conversation. The user reports a duplicate of the **latest
message** when bringing Messenger Native to foreground after the message was
already notified in the background. One earlier copy was 21 minutes old.

This is a distinct issue from the already-fixed false notifications for
unsent drafts and user-sent messages.

## Source-level finding

The shared `NativeNotificationCoordinator` previously retained sent
notification fingerprints for only 30 seconds and suppressed duplicates
**only if `prior.source != source`**, and then only within 8 seconds.

Consequently, the same DOM source could submit an identical message again
when Messenger's conversation list refreshed on focus. The native coordinator
would accept it as a new `UNNotificationRequest` with a fresh identifier.

The screenshot cannot definitively prove both entries came from the same
source, but this is a confirmed correctness gap in the existing code.

## New native deduplication policy

`NotificationDeduplicator.swift` is shared by both sources; the key remains
the normalized trusted chat path, title and notification body:

1. **Immediate same-source duplicate:** ignore identical payloads repeated
   within **2 seconds**, even if DOM generated new random identifiers.
2. **Immediate cross-source duplicate:** ignore equivalent Web/DOM payloads
   within **8 seconds**.
3. **Background-to-foreground replay:** when macOS reports
   `didResignActive` and then `didBecomeActive`, ignore an identical
   message *previously emitted during that exact background session* if it
   reappears during the first **10 seconds after returning to focus**.
   Keep a bounded in-memory record for up to **50 minutes**, which covers the
   21-minute interval seen in the user's screenshot.
4. **Genuine different content:** notification proceeds immediately in all
   window states.
5. Do **not** treat another past background session as the current session,
   and never activate the resume rule on fresh application startup.
6. Test/diagnostic notifications bypass dedup so the user can still
   validate notification permission repeatedly.

Retain at most 250 recent fingerprints. Never persist them or log messages;
the in-memory keys naturally contain title/body already used in native
notification delivery.

## Diagnostic counters

Under View → Notification Diagnostics…:

- `Same-source`: repeated identical notifications stopped promptly
- `Cross-source`: duplicate notifications from Web vs DOM
- `Focus replays`: notifications already emitted in the latest background
  session suppressed during foreground activation

The existing `Duplicates` metric is still the sum of all three.

## Important limits

Without Meta's genuine message ID, identical text sent twice in very quick
succession can be mistaken for a duplicate inside the 2-second immediate
window. A repeated identical message delivered at the exact moment of
foreground activation may also be mistaken for a replay of the previous
background notification. These are bounded trade-offs that cannot be
eliminated with text-only DOM previews alone.

The feature does **not** suppress all foreground notifications. Genuine
different incoming content while app is focused continues to notify.

## Real Mac acceptance

1. Update `feature/notification-focus-dedup`, quit the old app fully, build
   and install.
2. Keep Messenger Native running in background and receive a fresh message.
3. Confirm one notification; leave the app backgrounded for at least a few
   minutes, then click into Messenger Native. The previous message should
   **not** generate another notification on focus.
4. Keep the app focused and have another account send a **different** new
   message; it must notify normally.
5. Switch to background again, receive another new message, then return to
   focus. Confirm no replay.
6. Verify own messages, `Draft:` changes and send-button input remain silent.
7. Verify emoji in preview and click notification → open correct chat with no
   full page reload.
8. If a duplicate remains, check `View → Notification Diagnostics…` for
   `Same-source`, `Cross-source`, `Focus replays`, `Last source`, and
   `Submitted` before/after refocus. A screenshot with personal data hidden
   is sufficient.

Existing delivered notifications in macOS Notification Center are not
retroactively removed.

## Install

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/notification-focus-dedup
bash build.sh
bash install-local.sh
```

If the branch exists locally, use `git switch` and
`git pull --ff-only origin feature/notification-focus-dedup` before building.

Base is `feature/notification-all-window-states` (PR #11);
keep this change separate from call lifecycle, BTT and other features.

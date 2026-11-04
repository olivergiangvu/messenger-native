# Notification Preview Cleanup — Native Presentation Layer

## Problem confirmed on 2026-11-04

PR #8 filtered a standalone `Unread message` label in the DOM polling
engine, but the user still sees the label in new macOS notification banners.

The app has **two notification sources**, both delivered through
`NativeNotificationCoordinator.deliver`:

1. `nguon=dom`: a best-effort DOM conversation-list observer.
2. `nguon=web`: an intercepted Messenger Web `new Notification(...)`
   (including the document-context ServiceWorkerRegistration shim).

The previous filter only handled the first source, leaving the second
path untouched.

## New fix

`NotificationPreviewFormatter.swift` sanitizes **title, subtitle and body**
at the shared Swift boundary immediately before `UNMutableNotificationContent`
is created, regardless of notification source.

The formatter removes only recognizably *separate UI status prefixes*, e.g.:

- `Unread message\nAlice` → `Alice`
- `Unread message\nHello` → `Hello`
- `Unread message · Alice` → `Alice`
- `2 unread messages\nTeam` → `Team`
- `Tin nhắn chưa đọc\nNội dung` → `Nội dung`

A **real message** consisting solely of `Unread message` is preserved.
A sentence containing those words in the middle remains untouched.
Notification chat paths, clicks, delivery behavior, previews other than the
status prefix, sounds and unread state detection are unchanged.

The same cleaned title/body feed the native cross-source deduplication key.

## Privacy-preserving diagnosis

`View → Notification Diagnostics…` now shows two new coordinator metrics:

- `Unread labels removed`: number of notification payloads sanitized
- `Last source`: `dom`, `web` or `test`

The app logs **only the source and whether a status marker was removed**,
not conversation titles, user identities or message text.

If the visible text remains after this fix but the counter does not
increment, the label's exact string/position differs from the patterns we
currently know, or it is supplied by macOS independently. Collect a
screenshot with personal details masked before expanding the filter.

## Test

A pure Foundation Swift regression suite covers Web and DOM prefixed
examples, standalone subtitle, unread counter variants, and preserving
legitimate message text. macOS CI also compiles the entire AppKit app.

After installing, fully quit Messenger Native and relaunch the new build,
then receive a **new** message notification while the app is backgrounded.
Existing notifications already delivered to Notification Center cannot
be rewritten retroactively.

## Build on Mac

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/notification-preview-native-filter
bash build.sh
bash install-local.sh
```

If the branch exists locally, switch to it and pull --ff-only instead.

## Scope

Base: `feature/notification-clean-preview` / PR #8.
This is a follow-up correction to that PR, **not a change** to notification
tap navigation (the no-reload route was user-verified), calls, Reels,
system-language menus, BTT Stage Manager or RAM behavior.

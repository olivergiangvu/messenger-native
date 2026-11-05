# Notification freshness and one-card-per-chat UX

## Field evidence — 2026-11-05, 11:14

The user's screenshot shows several Notification Center entries for one
Messenger conversation, including exact generic status texts
`Unread message:` / `Tin nhắn mới` and actual message previews.
Some entries carry ages of ~21 minutes.

**Important:** The age markers prove that older notifications still appear
in Notification Center, not necessarily that each of those old notifications
was newly reissued at 11:14. Without native source/timestamp instrumentation
we should not claim the Web API or DOM alone caused all of these entries.

## Verified correctness gaps

1. DOM `notification-engine.js` previously treated an unseen unread
   conversation in the top six rows as a **new incoming message**:
   `freshTopUnread = !old && index < 6 && unread`. This is unsafe because
   WebKit restores, resorting and virtualized row rendering can expose an
   old unread conversation. A newly visible row is NOT proof of an event.
2. Both sources passed new/random notification identifiers to
   `UNNotificationRequest`. Even when `content.threadIdentifier` groups
   them, separate request IDs can accumulate several cards for one chat.
3. A low-information generic Web message status can overwrite a richer
   conversation preview if sent later.

## Changes

### 1. Event freshness (DOM)

- For a conversation not previously observed by this page instance,
  **establish baseline only**; do not fire a notification on that scan.
- Notify only when a **previously observed conversation's rendered preview
  changes**, and existing unread/selected, draft and local self-send
  safeguards consider it eligible.
- A read/unread flag changing by itself still cannot create a banner.
- Preserve notification behavior across foreground, visible and background
  states for **known** conversations.
- Add privacy-safe diagnostic counters `unknownRowsBaselined` and
  `staleCandidatesBlocked`.

**Trade-off:** A truly brand-new chat never seen in the current DOM list
may fail to notify for its FIRST message using the DOM fallback. If
Messenger invokes its own Web Notification API for that event, that
independent channel still works. We must not call this perfectly reliable
delivery in every case.

### 2. Native Notification Center presentation

Use a stable `UNNotificationRequest.identifier` for known first-party
conversation paths, such as `mn-chat:/t/123`, rather than a random ID
for every message. Apple documents that a delivered request with the same
identifier is replaced and re-alerts, rather than building up a long list
of separate cards. Different chat paths remain isolated.

- The latest incoming message replaces the previous Notification Center
  card from that conversation; it still produces a new alert.
- Notification's `mnConversationPath` userInfo remains unchanged, so
  tapping it still opens the correct chat without a WebKit reload.
- Test/diagnostic notifications retain their unique ID.
- Unknown Web event routes retain their original ID. Never infer a chat
  identity from a display name, which may not be unique.
- A generic body such as `Unread message:` or `Tin nhắn mới` is
  ignored only if a **richer preview from that same verified conversation**
  was submitted within the previous 90 seconds. Otherwise its original
  behavior remains intact; do not drop all generic events globally.
- Privacy-safe coordinator counters: `DOM submitted`,
  `Web submitted`, `Thread cards replaced`, `Generic suppressed`,
  `Web no-thread received` and `Web no-thread submitted`. These last
  two distinguish Web Notification API events which contain no validated
  `/t/<id>` route and therefore cannot be safely merged into a specific
  conversation without guessing the chat identity.

References:
- Apple's UNNotificationRequest(identifier:content:trigger:) documentation
  confirms a new request with the same ID replaces an already-delivered
  notification while alerting again.
- Apple's UNMutableNotificationContent.threadIdentifier documentation
  describes grouping but does not guarantee a single card.

## Test plan

1. Fully quit, rebuild and install the current feature branch.
2. Existing notifications from earlier builds may remain in Notification
   Center; old random-ID cards are **not retroactively removed**.
3. Receive two different messages from the SAME conversation. A fresh
   banner should appear for each distinct incoming event, but only the
   latest notification card should remain from this version for that chat.
4. Receive a new message from a SECOND conversation: it must get its own
   notification.
5. Click the latest card to open the correct chat without reload.
6. Bring an old unread conversation into view by scrolling/reopening
   the Chats list. An old preview must not be sent as a fresh notification.
7. Receive a genuinely changed preview in an existing conversation while
   app is focused. It must still notify.
8. Confirm sending your own messages or typing drafts stays silent.
9. If duplicates continue, check `View → Notification Diagnostics…`
   and report **DOM submitted / Web submitted / Thread cards replaced /
   Generic suppressed / Web no-thread received / Web no-thread submitted**,
   plus the `unknownRowsBaselined` counter.
   None of these counters contain names or message text.

## Branch

`feature/notification-event-freshness`, based on
`feature/dock-unread-accuracy` / PR #13.
This does not alter call handling, the BetterTouchTool fix, system-language
menus, notification tap routing or content emoji recovery.

Keep Draft until CI and field verification.

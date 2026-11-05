# Dock badge: only observed unread conversations, not the Chats navigation count

## Field report — 2026-11-05

The user sees a **red 2** on Messenger Native's macOS Dock icon, but cannot
identify two corresponding unread conversations in the Messenger sidebar.
The screenshot does not conclusively establish whether Meta has additional
unread conversations outside the rendered list.

## Verified source-level cause

The existing `main.swift` JavaScript reads
`[aria-label^="Đoạn chat"], [aria-label^="Chats"]` every 3 seconds,
extracts the number after the middle dot (example:
`Chats · 2 unread messages`) and directly sends it to
`NSApp.dockTile.badgeLabel`.

This value belongs to Messenger's navigation UI, which can have different
semantics (for example total unread *messages* or other inbox surfaces)
than the unread conversations currently displayed in the chat list.
It is not related to our macOS Notification Center count.

## Updated source-of-truth policy

- Remove the independent 3-second Chats navigation label parser entirely.
- Reuse the same `notification-engine.js` conversation-list scanner used
  for detection of incoming messages. Its `unread(row)` routine checks
  explicit unread accessibility indicators, then rendered bold styling.
- For each scan, compute **unique chat paths** among the rendered rows whose
  status indicates unread; count each conversation once even if duplicate
  DOM rows appear.
- Pass a typed/scoped message to native Swift:
  `{nguonBadge: "rendered-conversations", soChuaDoc: N, soDongHienThi: R}`.
- If no conversation list is observable, send
  `{nguonBadge: "unknown", soChuaDoc: 0, soDongHienThi: 0}`
  to explicitly **clear** a stale badge; do not assume zero unread in Meta.
- Swift accepts only the main WKWebView and known `nguonBadge` values and
  sets `dockTile.badgeLabel` when N is positive, otherwise clears it.
- Avoid adding a second DOM timer: the existing MutationObserver + 3.5-second
  recovery scan updates the Dock badge.
- `View → Notification Diagnostics…` reports source, visible row count,
  unread chat count (or `none`) and number of badge reports; no names or
  message content are logged.

## What the badge means now

**Visible unread conversations** detected in the list currently rendered
by Messenger Web. It does **not** promise the global unread-message total
across archived inboxes, filtered folders, message requests, other
unrendered/virtualized conversations, or other devices. The scanner caps
analysis at 75 rendered rows. If Messenger's DOM is ambiguous (for example
bold text does not actually mean unread), this count can still differ
from Meta's internal state.

This narrower, explicitly named scope is preferable to displaying a
navigation-header number that cannot be reconciled with the sidebar.
It also means no red badge when the sidebar is absent.

## Acceptance on a real Mac

1. Completely quit Messenger Native, build/install this feature branch.
2. Open Chats and confirm no badge if every **rendered** conversation has
   been read. Mark one visible chat as unread and verify badge **1**.
3. Mark another as unread and verify badge **2**, then read them again:
   badge returns to **1** and then disappears.
4. If the Messenger Chats navigation header still says `2` but only one
   row is visibly unread, the Dock should show **1**.
5. Navigate to a page without a rendered chat list; badge should clear
   instead of retaining the previous count. Return to the list and verify
   it rebuilds.
6. Verify message notification, native sound, no-reload click-to-chat,
   emoji previews, draft/own-message suppression, calls and BTT remain
   unchanged.
7. If a discrepancy remains, open `View → Notification Diagnostics…`.
   Copy only `Dock badge`, `Source` and `Rendered rows` and compare to
   how many chat rows Messenger visually marks unread.

## Install

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/dock-unread-accuracy
bash build.sh
bash install-local.sh
```

If the branch exists locally, switch to it and run
`git pull --ff-only origin feature/dock-unread-accuracy`.

Base: `feature/notification-focus-dedup` (PR #12). Keep this scoped
badge change in its own draft PR until macOS CI and real user verification.

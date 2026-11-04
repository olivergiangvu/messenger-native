# Trim Messenger unread-status badge from macOS notification previews

## User feedback — 2026-11-04

The notification deep link now opens the correct Messenger conversation
without a full WKWebView reload. However, the visible banner sometimes
includes a leading **"Unread message"** UI status label, which is
unnecessarily distracting and uses space.

## Targeted fix

The DOM fallback notification engine parses Messenger's conversation-list
anchor `innerText` and uses the first line as sender/chat title and the
remaining lines as notification preview.

An accessibility/status label such as `Unread message` (or
`2 unread messages`) may appear as its own line ahead of the real title
or message preview.

We now filter only an **exact, standalone unread-status line** in the
first two header lines when it is **not the final preview line**:

- `Unread message` / `Unread messages`
- `2 unread messages`
- `Tin nhắn chưa đọc` / `2 tin nhắn chưa đọc`

We do not strip arbitrary occurrences of `unread message` from a
sentence or a message's final/only preview line. For example, a real
message with exactly the text `Unread message` is kept.

## Not changed

- Native notification title/subtitle layout, macOS sound, delivery logic
- Unread-state detection (which can still use accessibility labels)
- Notification tap routing (already verified no-reload)
- Calls, Reels, Stage Manager/BetterTouchTool, system language, RAM

## Validation

The regression test sends a simulated notification from a conversation
where the unread label appears before the name or before the preview and
checks that only the real sender/message reaches macOS. The same suite
also tests a genuine message literally saying `Unread message`.

This is a source-specific fix for the **DOM fallback**. If another
notification source supplies the same phrase in a different format,
inspect a redacted example before applying broader text replacement,
to avoid accidentally altering real message content.

## Install

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/notification-clean-preview
bash build.sh
bash install-local.sh
```

For an existing local branch, use
`git switch feature/notification-clean-preview && git pull --ff-only`.

Leave Messenger Native running in the background, receive a real message,
and check that the banner shows the conversation title and message preview
without a standalone unread-status label. Click it to confirm existing
no-reload chat navigation still works.

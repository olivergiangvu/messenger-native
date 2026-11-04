# Preserve emoji in Messenger Native notification previews

## User report (2026-11-04)

Messenger Native receives notifications, and the no-reload click-to-chat
workflow is confirmed working, but emoji are missing from some message
previews.

## Why this may happen

`notification-engine.js` currently uses `anchor.innerText` / `textContent`
to reconstruct a message preview from Messenger Web's conversation list.

When Messenger renders inline Unicode emoji using image nodes (e.g.
`<img alt="😊">` or `<span role="img" aria-label="❤️">`),
`innerText` does **not** include those image accessibility attributes.
As a result, the message may look complete in Messenger Web but lose
inline emoji when converted to a text-only macOS notification.

This explanation is supported by source inspection; it is **not yet
confirmed** with a DOM snapshot from the user's live Messenger session.
The Web Notification API path already passes Unicode through Swift and
should not require this change.

## Fix in the DOM fallback path

- Only when an anchor contains images with an exact Unicode emoji
  representation, reconstruct its text in document order, preserving
  inline emoji at their original position.
- Accept actual emoji graphemes, including flags and multi-codepoint
  ZWJ/skin-tone sequences.
- Do **not** use arbitrary image captions, sticker labels, user names,
  avatar names or attachment descriptions as emoji.
- Continue to run the existing standalone "Unread message" UI marker
  filter on the resulting text lines.
- If no recoverable Unicode emoji exists, preserve the previous
  `innerText` logic unchanged.
- Leave the native Swift presentation formatter, deduplication,
  notification sound, click-to-chat navigation and all other app
  features untouched.

## Regression coverage

`Tests/NotificationEmojiTests.cjs` covers:

1. Inline emoji in the middle of a sentence
2. Emoji-only preview
3. National flag emoji
4. ZWJ / skin-tone composition
5. `role="img"` with an emoji `aria-label`
6. Ordinary Unicode emoji (no image)
7. Avatar name and photo `alt` ignored
8. Existing title and conversation path preserved

The native `NotificationPreviewFormatterTests.swift` also verifies
that the final Swift notification boundary preserves Unicode emoji and
still removes a *separate* unread-status UI badge where appropriate.

## Manual acceptance test

1. Install the `feature/notification-emoji-preview` branch.
2. Fully quit the old Messenger Native app before rebuilding.
3. While the app is backgrounded, send a **new** message containing
   ordinary emoji, for example `Hẹn nhé 😊`, from another device.
4. Verify the macOS banner contains the emoji and still opens the
   correct chat **without a full WebKit reload**.
5. Repeat with a standalone `😂` and composed `👩🏽‍💻` or `🇻🇳`.
6. If an emoji is still missing, inspect whether the notification came
   from `web` or `dom` in View → Notification Diagnostics and share a
   redacted banner screenshot. The image may be a custom sticker or a
   non-Unicode representation for which no accurate text equivalent is
   available.

Existing delivered macOS notifications cannot be updated retroactively.

## Build

```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/notification-emoji-preview
bash build.sh
bash install-local.sh
```

If the branch exists locally, use `git switch` followed by
`git pull --ff-only origin feature/notification-emoji-preview`.

Base: `feature/notification-preview-native-filter` (PR #9).
The independent emoji issue can be validated without merging PR #9.

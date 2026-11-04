# Floating incoming-call actions — safe handoff to the original dialog

## Confirmed field finding (2026-11-04)

With Facebook open in **Safari** and Messenger Native running:

- Pressing **Accept or Decline on the custom floating incoming-call panel** correlates with paired call-history records.
- Clicking the **actual Accept/Decline buttons in the Messenger page's own call dialog** does **not** produce the paired entries.
- Messenger **mobile** displays only one call record.
- Ghost ringing has been intermittent and was last observed coming from Safari's Facebook tab, not Messenger Native's native ringtone; do not change the working native ringtone or sound interception to solve this problem.

The original custom panel used `webView.evaluateJavaScript("window.__vmBamGoiDen(...)")`, whose JavaScript implementation found the page button and called `element.click()`. This produces a synthetic click event. Such events are not identical to a genuine click in the web page, and in this user's environment the results differed.

This **does not prove** the internal server-side reason for the double records. It does identify an app-specific path that can be eliminated safely.

## Safe behavior in this branch

**Before:** floating panel red "Từ chối"/green "Chấp nhận" → WebKit evaluates JavaScript → performs `element.click()` on Messenger's DOM → native ring stops and panel closes.

**After:**
1. Floating panel red **"Mở để từ chối"** / green **"Mở để nhận"** → frontmost Messenger Native chat window.
2. The user then presses the real **Decline / Accept** control in the original Messenger incoming-call dialog.
3. Only that in-page action determines call state. The native ringtone continues during handoff and stops when the original call dialog closes or the call session begins.

This is intentionally **two gestures**, not one-tap answering or rejecting. It trades a small UX inconvenience for avoiding the exact unsafe path correlated with double entries. No coordinate-based click, simulated system input, undocumented WebKit API or attempt to deactivate Safari is introduced.

The old `window.__vmBamGoiDen` synthetic click bridge has been removed entirely. `Call Diagnostics` adds `Floating call actions handed to in-page dialog` as a non-sensitive counter.

## Acceptance test

1. Quit Messenger Native (`⌘Q`).
2. Update and install:
```bash
cd ~/messenger-native
git fetch origin
git switch --track origin/feature/safe-floating-call-actions
bash build.sh
bash install-local.sh
```
If the branch exists: `git switch feature/safe-floating-call-actions && git pull --ff-only`.
3. With Safari Facebook open, have a second device/account place **one incoming call**.
4. Click **Mở để nhận** on the custom floating banner: Messenger Native must come to front with Messenger's own incoming-call dialog still visible. The call must not yet be accepted.
5. Click the genuine **Accept** button in that dialog. Finish the call, then inspect mobile and desktop call history.
6. Repeat with **Mở để từ chối** and genuine **Decline**.
7. Check `Xem → Call Diagnostics`: `Floating call actions handed to in-page dialog` should increase once per floating-panel action. The native ringtone's `Started/Stopped` must remain balanced after call completion.
8. Recheck that the confirmed Reel and notification fixes still work.

If duplicate call records continue after an authentic in-page click, revisit Meta/Safari session handling and collect controlled before/after details. Do not hide/delete history entries.

## Scope and limitations

- The floating panel is not a macOS actionable notification. It is an AppKit `NSPanel`.
- A future safe one-click action would need a reliable, supported path with the same behavior as a genuine user gesture in the Messenger page. The current WebKit synthetic-click bridge cannot be assumed equivalent.
- This fix applies only to the app's floating panel. It does not control Safari Facebook's Media Session or a stuck browser ringtone.

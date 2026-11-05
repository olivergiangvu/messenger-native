# Incoming-call regression A/B on the same Mac — 2026-11-05

**No release has been created.** This is an isolation test, not a rollback pre-release or a claimed fix.

## What GitHub source history actually establishes

- PR #4 (`529efa3c...`): historical source revision with the original ARIA `[role=dialog] [aria-label]` incoming-call detector and 700 ms recovery polling. **Not proven to be the last user-confirmed good binary.**
- PR #16 (`417ae36d...`): includes later message/notification and Reel changes.
- PR #17 (`cedd5a15...`): final source checkpoint before PR #18 memory work. The original missed call reported on Nov 5 occurred on an installed app *before PR #18 was deployed*.
- PR #20: draft experimental fixes; the first iteration unintentionally restricted the legacy detector. Later commits restore the old selector. It has not been validated by a real successful incoming call on the user's Mac.

The incoming-call selector and detector implementation were the same across PR #4, #10, #15, #16 and #17. If these revisions differ in an actual test, investigate *other* changes (script injection, routing, notification helpers, WebKit settings, process state), not automatically the detector's source.

## Prepare one candidate, without installing it

Run in Terminal on the actual Mac:

```bash
cd ~/messenger-native
git fetch origin
git switch fix/incoming-call-alert-reliability
git pull --ff-only
bash -n scripts/prepare-call-ab.sh
bash scripts/prepare-call-ab.sh pr4
```

This generates a freshly compiled, locally signed PR #4 app under:

`~/MessengerNativeCallAB-20261105/candidates/pr4/<sha>/Messenger Native.app`

It also preserves **one local emergency copy of the current installed .app** at:

`~/MessengerNativeCallAB-20261105/installed-before-ab/Messenger Native.app`

No running app is closed, installed, published, tagged, or updated. The script requires the existing `KY_APP` or `.ky-app` signing identity and aborts rather than silently comparing an ad-hoc-signed build whose macOS notification permissions may differ.

**Important:** the saved installed app is an emergency binary copy of a currently known-issue app; it is NOT labelled stable or published. It preserves the bundle, but the test does not back up/modify Messenger's external WebKit data. Do not clear website data or re-login during the comparison.

## Controlled real-call test

1. Close Safari/other devices' active Messenger web *tabs* for the duration of the test, leaving the second device/account as the caller. Confirm macOS Focus mode and Messenger Native notification authorization stay unchanged.
2. Explicitly install the just-built candidate, substituting the exact path printed by `prepare-call-ab.sh`:

   `bash install-local.sh "/full/path/printed/Messenger Native.app"`

   This installation step **does** quit/restart Messenger Native, but does not clear WebKit cookies.
3. With Messenger Native **in background behind Finder**, place an incoming audio call from the same second account. Record (A) webpage incoming UI, (B) floating native panel, (C) macOS banner, (D) ringtone. Decline/hang up, then try a second distinct incoming call, verifying the old ringtone stops and the next call appears.
4. Optionally open `View > Call Diagnostics...` after the call. Older builds may not include newer diagnostic counters; that is expected.
5. Restore the original locally saved app if stopping the test:

   `bash install-local.sh "$HOME/MessengerNativeCallAB-20261105/installed-before-ab/Messenger Native.app"`

6. If PR #4 works, build `pr16` next, using the same script and installer, to locate the first bad revision. If PR #16 works, try `pr17`. If PR #4 fails, do **not** infer the code is correct or that Meta is responsible; collect the same live call traces, then investigate OS/bundle/WebKit shared state and possibly earlier revisions.

## Result matrix to fill from real calls

| Revision | Web call UI | Floating call panel | macOS call banner | Native ringtone | Second call |
| --- | --- | --- | --- | --- | --- |
| PR #4 original detector | Not tested | Not tested | Not tested | Not tested | Not tested |
| PR #16 | Not tested | Not tested | Not tested | Not tested | Not tested |
| PR #17 | Not tested | Not tested | Not tested | Not tested | Not tested |
| PR #20 draft | User reports failure | User reports failure | User reports failure | Unverified | Unverified |

Test the **same** foreground/background condition across revisions. The older app may intentionally suppress its floating panel while its chat window is active; panel comparisons should be made with Messenger behind another app.

Neither a CI pass nor a synthetic popup is proof that actual incoming-call events are being supplied to WKWebView.

## Stop conditions

- Never upload `.ky-app` or a signing certificate.
- Never commit local ZIP/.app/session data into Git.
- If a revision receives the live call, use the next candidate to bisect. Do not stack more unproven fallback code.
- Only after **real** incoming call dialog/panel, notification and the **second** call work do we create the user-requested pre-release and resume RAM work.

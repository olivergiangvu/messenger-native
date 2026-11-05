# Messenger Native RAM optimization — phase 1 (2026-11-05)

## Objective
User-reported idle baseline: **900–1300 MB**. Aspirational target: **300–400 MB**, not a guaranteed deliverable. The native .app binary size is NOT the memory footprint of Messenger Web.

The app normally creates one main WKWebView; WebKit runs separate web-renderer and supporting processes. The Swift process alone is not the entire app's cost.

## Implemented (reversible, low-risk)
- **Incoming calls**: Keep MutationObserver fast response (~70 ms), active-call recovery at 700 ms. When no call is detected and observer is connected, increase idle recovery interval from 700 to 1400 ms, reducing full DOM idle scans ~50%. If observer is missing, keep 700 ms fallback.
- **Debug-only measurements**: Do not collect per-scan timing samples or send profiling logs unless VM_NHIP debug mode is enabled.
- Preserve notification engine 3500 ms fallback, chat history, call overlay/ringtone, background page execution, dedup, Dock, Reels browser handoff, downloads, and localization.
- Do not disable WebKit sandbox, clear login/cache, block Meta resources, or suspend background JS for a synthetic low number.

This stage mainly reduces wakeups and short-lived allocations. **No RAM reduction measured yet.**

## Measure on the real Mac
Run the profiler with the currently installed stable app, and again with this draft branch in comparable states:

    cd ~/messenger-native
    bash scripts/profile-memory.sh

If detection fails, find the main PID with pgrep -fl Messenger and pass the PID to the script.

Collect each of these:
1. Cold settled, two minutes after launch.
2. Warm active, twenty minutes of normal chat.
3. Warm background, thirty minutes covered/minimized.

In Activity Monitor > View > All Processes, identify Messenger-associated WebKit processes. Do not sum WebKit processes from unrelated apps. Compare physical footprint (Memory), not virtual allocation or raw RSS totals.

## Accept/reject
- Two distinct real incoming messages still notify; old notification timestamps never repeat.
- Voice/video/group incoming call, ringing, accept/decline, dismiss work in foreground/background.
- Reels, notification tap routing, attachments, download, shortcuts, Stage Manager and localization unchanged.
- No increase in warm footprint or CPU under similar workload.
- On call detection regression, revert idle recovery from 1400 ms to 700 ms.

## Next stage
If Swift footprint is large/growing: use Instruments to inspect retained WKWebView/NSWindow and native objects.
If WebContent dominates: profile media/DOM with Web Inspector, then consider only reversible opt-in media-defer methods. Memory target 300–400 MB is not credible until measured.
This draft is stacked on PR #17, not a stable release.
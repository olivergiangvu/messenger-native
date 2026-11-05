# Messenger Native — WebKit memory diagnostics (Phase 2)

## Evidence and limits

On the user's Mac (2026-11-05, pre-optimization install):
- Native main PID 46177: physical footprint **28 MB** at 18:11 and 18:14.
- Candidate WebContent PID 46185: **534 -> 620 MB** in 2m49s; previous peak **861 MB**.
- Candidate WebContent PID 46201: **139 -> 145 MB** in 2m49s.
- The three snapshots sum to 701 -> 793 MB **only if both helpers actually belong to Messenger**. PID proximity and timestamps are not conclusive ownership evidence; helpers typically show PPID=1.
- Physical footprint is not RSS; the reported 861 MB peak for one process is not concurrent with the other snapshots.
- Growing footprint for one short interval is not enough to establish a leak, or which category consumes it.

## New on-demand View menu

Install this draft only AFTER collecting a baseline on the currently installed app. Then open:

**View / Xem -> Memory Diagnostics... / Chẩn đoán bộ nhớ...**

This gives counts only: DOM elements, images, loaded images, sampled image decoded-pixel *proxy*, video elements/playing count, iframes, canvas, SVG, resource-timing entry count, and JS heap size only if the platform exposes it.

The diagnostic is NOT a process memory report and does not reveal message text, contact names, user IDs, or URLs. Pixel proxy assumes four bytes/pixel per image element and can double-count images that reuse the same decoded resource; it is NOT actual image memory. On WebKit/Safari, JavaScript heap size is often unavailable; a null result is expected.

The diagnostics helper registers a function at document start, but does not scan or poll until the user opens that menu. It does not alter image-loading, WebRTC/calls, media playback, notifications, Reels, click routing, messages or caches.

## Read-only time series (physical footprint)

With this branch checked out, but **before building/installing**, record the current app baseline:

    cd ~/messenger-native
    git pull --ff-only
    bash scripts/profile-memory-series.sh --helper 46185 --helper 46201 --samples 10 --interval 60

The script emits CSV rows on stdout at one-minute intervals (about nine minutes between first and last samples). To save locally, append a shell redirection of your choice. **Do not supply stale helper PIDs** if WebKit restarted; obtain new PIDs from scripts/profile-memory.sh, and verify which WebKit processes are associated with Messenger via Activity Monitor. The script does not auto-claim ownership.

Next, after all CI checks pass, install this PR's test app, rerun the same scenario and capture another CSV series. Match window size, selected chat, attachments, background/foreground state and other app workload. The Memory Diagnostics counts help decide whether DOM/media grows while the WebContent physical footprint grows.

For attribution and detailed allocation categories, use:
- Safari -> Develop -> Messenger Native -> Web Inspector.
- Timelines -> Memory (JavaScript / Images / Layers / Page when available).
- Do not interpret Inspector-instrumented runs as normal idle RAM baselines; instrumentation itself may add overhead.

## Safe optimization gate

If image allocations dominate, investigate decoded image retention before introducing any optional media policy. If JavaScript dominates, use heap allocation snapshots and retained-object analysis. If layout/layers dominate, investigate render trees and compositing. Do **not** clear IndexedDB, cookies, force WebKit process termination/reload or blanket-block CDN without separate real-Mac testing.

User goal is 300–400 MB, but this PR is **instrumentation only**, not a claim of memory savings. Based on PR #18, which is itself stacked on PR #17; keep Draft until CI and user field validation.

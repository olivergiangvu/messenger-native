/*
 * Incoming GROUP call availability (not a ringing one-to-one call).
 * Dedicated passive watcher independent of notification-engine.js.
 *
 * Only a fresh transition from no ongoing group call to a positively
 * confirmed joinable ongoing call is reported to Swift. The first populated
 * chat-list snapshot is SILENT. Never auto-join, record text, or access chats.
 */
(() => {
  if (window.__mnGroupCallDetector) return;
  const bridge = window.webkit?.messageHandlers?.vmThongBao;
  const emit = p => { try { bridge?.postMessage(p); } catch (_) {} };
  const sessions = new Map();
  const MAX_ROWS = 35;
  const MAX_SESSIONS = 80;
  let initialized = false;
  let scans = 0;
  let detectedTransitions = 0;
  let endedTransitions = 0;
  let observer = null;
  let observerRoot = null;
  let queued = false;
  let lastScanRows = 0;
  let lastScanOngoingRows = 0;
  let lastScanJoinRows = 0;
  let lastScanLiveRows = 0;
  let initialActiveRows = 0;
  let untrackedActiveRows = 0;
  const normalize = s => String(s || '').replace(/\s+/g, ' ').trim();
  const ongoing = /(?:\bongoing\s+(?:(?:group|video|voice|audio)\s+)?call\b|cuộc gọi đang diễn ra|đang gọi nhóm)/i;
  const groupJoin = /(?:joined (?:the |a )?(?:group )?(?:video|voice|audio) call|started (?:the |a )?(?:group )?(?:video|voice|audio) call|tham gia cuộc gọi (?:video |thoại )?nhóm|bắt đầu cuộc gọi (?:video |thoại )?nhóm)/i;
  const video = /video|hình ảnh/i;

  function parseRow(row) {
    const anchor = row.querySelector('a[href*="/t/"]');
    if (!anchor) return null;
    const raw = anchor.getAttribute('href') || '';
    let url;
    try {
      url = new URL(raw, location.href);
      if (url.origin !== location.origin || !/^\/t\/[^/?#\s]+\/?$/.test(url.pathname)) return null;
    } catch (_) { return null; }
    const lines = String(anchor.innerText || '').split('\n')
      .map(normalize).filter(Boolean);
    if (!lines.length) return null;
    // The screenshot shows "Ongoing call" in the sidebar status while
    // "X joined the video call" appears in the OPEN CONVERSATION BODY.
    // Requiring BOTH strings inside one sidebar row prevented any detection.
    // Read row text and short accessibility labels; never read full chat body.
    const attrs = [row, anchor].concat(
      Array.from(row.querySelectorAll?.('[aria-label], [title]') || []).slice(0, 20)
    ).map(node => {
      if (typeof node.getAttribute !== 'function') return '';
      return [node.getAttribute('aria-label'), node.getAttribute('title')]
        .filter(Boolean).join(' ');
    }).join(' ');
    const text = (lines.join(' ') + ' ' + String(row.innerText || '') + ' ' + attrs)
      .slice(0, 1600);
    const hasOngoing = ongoing.test(text);
    const hasJoin = groupJoin.test(text);
    // A fresh, observable OFF -> ON transition in this existing thread is
    // enough to describe an ongoing call. Join text is supplementary only.
    // "Group video call / Tap to join" alone is never an active signal.
    const active = hasOngoing;
    const name = lines[0].slice(0, 100);
    return { path: url.pathname, name, active, hasOngoing, hasJoin,
             video: video.test(text) };
  }

  function scan() {
    queued = false;
    if (/\/groupcall(?:\/|$)/.test(location.pathname)) return;
    scans++;
    const rows = [...document.querySelectorAll('[role="row"]')].slice(0, MAX_ROWS);
    if (!rows.length) return;
    const current = rows.map(parseRow).filter(Boolean);
    lastScanRows = current.length;
    lastScanOngoingRows = current.filter(item => item.hasOngoing).length;
    lastScanJoinRows = current.filter(item => item.hasJoin).length;
    lastScanLiveRows = current.filter(item => item.active).length;
    if (!current.length) return;
    const first = !initialized;
    if (first) initialActiveRows = lastScanLiveRows;
    initialized = true;
    const now = Date.now();
    for (const item of current) {
      const prior = sessions.get(item.path);
      let reported = prior?.reported === true;
      if (!first && item.active && prior && !prior.active) {
        detectedTransitions++;
        reported = true;
        emit({ mnGroupCallStarted: {
          path: item.path, title: item.name, video: item.video
        }});
      }
      // An ongoing call present at first load was deliberately NOT announced:
      // do not send a stray "ended" event for that unannounced older call.
      if (!first && !item.active && prior?.active && prior.reported) {
        endedTransitions++;
        emit({ mnGroupCallEnded: item.path });
      }
      // An already-active unseen conversation is a historical baseline,
      // NOT proof that a new group call has just started.
      if (!first && item.active && !prior) untrackedActiveRows++;
      sessions.delete(item.path);
      sessions.set(item.path, { active: item.active, seen: now, reported: item.active && reported });
    }
    for (const [path, state] of sessions) {
      if (now - state.seen > 30 * 60 * 1000) sessions.delete(path);
    }
    while (sessions.size > MAX_SESSIONS) {
      sessions.delete(sessions.keys().next().value);
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(scan, 100);
  }
  function connect() {
    const first = document.querySelector('[role="row"]');
    const root = first && (first.closest('[role="grid"],[role="list"],[role="navigation"]') ||
                          first.parentElement?.parentElement);
    if (!root || root === observerRoot) return;
    observer?.disconnect();
    observerRoot = root;
    observer = new MutationObserver(schedule);
    observer.observe(root, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'aria-label']
    });
    schedule();
  }
  setInterval(() => { connect(); scan(); }, 1800);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { connect(); scan(); }, { once: true });
  } else { connect(); scan(); }
  window.__mnGroupCallDetector = {
    status: () => ({
      installed: true, version: '0.2-ongoing-status-transition',
      initialized, scans, detectedTransitions, endedTransitions,
      observerAttached: !!observer,
      lastScanRows, lastScanOngoingRows, lastScanJoinRows, lastScanLiveRows,
      initialActiveRows, untrackedActiveRows,
      activeGroupRows: [...sessions.values()].filter(v => v.active).length
    })
  };
})();
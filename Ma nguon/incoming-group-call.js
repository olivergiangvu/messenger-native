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
  const normalize = s => String(s || '').replace(/\s+/g, ' ').trim();
  const ongoing = /(?:\bongoing call\b|cuộc gọi đang diễn ra|đang gọi nhóm)/i;
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
    const text = lines.join(' ').slice(0, 700);
    // Group-specific evidence + current call availability are BOTH required.
    // "The video call ended" and a stale "Group video call" card never pass.
    const active = ongoing.test(text) && groupJoin.test(text) &&
                   !/^\s*(?:the video call ended|cuộc gọi đã kết thúc)\s*$/i.test(lines[lines.length - 1] || '');
    const name = lines[0].slice(0, 100);
    return { path: url.pathname, name, active, video: video.test(text) };
  }

  function scan() {
    queued = false;
    if (/\/groupcall(?:\/|$)/.test(location.pathname)) return;
    scans++;
    const rows = [...document.querySelectorAll('[role="row"]')].slice(0, MAX_ROWS);
    if (!rows.length) return;
    const current = rows.map(parseRow).filter(Boolean);
    if (!current.length) return;
    const first = !initialized;
    initialized = true;
    const now = Date.now();
    for (const item of current) {
      const prior = sessions.get(item.path);
      if (!first && item.active && prior && !prior.active) {
        detectedTransitions++;
        emit({ mnGroupCallStarted: {
          path: item.path, title: item.name, video: item.video
        }});
      }
      if (!first && !item.active && prior?.active) {
        endedTransitions++;
        emit({ mnGroupCallEnded: item.path });
      }
      // Avoid a new event from navigation to a previously unseen conversation:
      // a new live call must transition from a previously observed inactive row.
      sessions.delete(item.path);
      sessions.set(item.path, { active: item.active, seen: now });
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
      installed: true, version: '0.1-group-ongoing',
      initialized, scans, detectedTransitions, endedTransitions,
      observerAttached: !!observer, activeGroupRows: [...sessions.values()]
        .filter(v => v.active).length
    })
  };
})();
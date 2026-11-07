/*
 * Messenger Native — read-only incoming-call iframe probe.
 *
 * The main page's proven call detector is injected in the main frame only.
 * Some web calling UIs can render inside an embedded frame, so inspect only
 * subframes and report non-sensitive readiness/verified call signals.
 *
 * Never intercept media, navigate, click, auto-answer, read caller identity,
 * access cookies, or send full dialog text to Swift.
 */
(() => {
  if (window === window.top || window.__mnIframeCallProbeInstalled) return;
  window.__mnIframeCallProbeInstalled = true;

  const bridge = window.webkit?.messageHandlers?.vmThongBao;
  const send = payload => {
    try { bridge?.postMessage({ mnIframeCallProbe: payload }); } catch (_) {}
  };
  const accept = /^(?:accept|answer|chấp nhận|trả lời)(?:\s+(?:cuộc gọi|call|audio call|video call|voice call))?$/i;
  const decline = /^(?:decline|ignore|từ chối|bỏ qua)(?:\s+(?:cuộc gọi|call|audio call|video call|voice call))?$/i;
  const incoming = /\b(?:is calling|calling you|incoming (?:audio |voice |video )?call)\b|đang gọi|cuộc gọi đến|đã mời bạn tham gia cuộc gọi/i;

  let scans = 0, matched = false, lastReport = 0;
  let pending = false;
  function scan() {
    pending = false;
    scans++;
    const dialogs = Array.from(
      document.querySelectorAll('[role="dialog"],[role="alertdialog"]')
    ).slice(0, 12);
    let found = false;
    for (const dialog of dialogs) {
      const labels = Array.from(dialog.querySelectorAll('[aria-label]'))
        .map(node => (node.getAttribute('aria-label') || '').trim()).slice(0, 80);
      if (!labels.some(text => accept.test(text)) ||
          !labels.some(text => decline.test(text))) continue;
      const callText = String(dialog.innerText || '').slice(0, 900);
      if (incoming.test(callText)) {
        found = true;
        break;
      }
    }
    if (found && (!matched || Date.now() - lastReport > 60000)) {
      lastReport = Date.now();
      // Only a Boolean event: no names, message contents or conversation IDs.
      send({ kind: 'confirmedDialog', present: true });
    }
    matched = found;
  }
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(scan, 120);
  }
  send({ kind: 'frameReady' });
  const observer = new MutationObserver(schedule);
  function start() {
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['aria-label', 'role'] });
      schedule();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  setInterval(scan, 1500);
})();

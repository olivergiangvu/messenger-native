/*
 * Messenger Native — notification-driven chat navigation (no page reload).
 *
 * React owns the Messenger conversation route. To retain drafts and avoid
 * a full-document refresh, open an existing in-app conversation anchor only
 * after the main window has been activated. Retry briefly while the page
 * resumes from the background. Never rewrite history by hand: that could
 * change the address without changing the rendered conversation.
 */
(() => {
  if (window.__mnNotificationNavigation) return;
  let seq = 0;
  let lastStatus = 'idle';
  let lastAttempts = 0;
  const MAX_ATTEMPTS = 7;
  const RETRY_MS = 320;

  function normalize(raw) {
    if (typeof raw !== 'string' || !/^\/t\/[^/?#\s]+\/?$/.test(raw)) return null;
    const url = new URL(raw, location.origin);
    if (url.origin !== location.origin || url.search || url.hash) return null;
    return url.pathname.replace(/\/+$/, '');
  }

  function current() {
    return location.pathname.replace(/\/+$/, '');
  }

  function matchAnchor(target) {
    return Array.from(document.querySelectorAll('a[href*="/t/"]')).find(a => {
      try {
        const url = new URL(a.getAttribute('href') || a.href, location.href);
        return url.origin === location.origin &&
               url.pathname.replace(/\/+$/, '') === target;
      } catch (_) { return false; }
    });
  }

  function open(raw) {
    const target = normalize(raw);
    if (!target) {
      lastStatus = 'invalid';
      return lastStatus;
    }

    // Any later notification tap supersedes an earlier pending retry loop.
    const token = ++seq;
    lastAttempts = 0;

    function attempt() {
      if (seq !== token) return;
      if (current() === target) {
        lastStatus = 'route-matched';
        return;
      }
      lastAttempts++;
      const anchor = matchAnchor(target);
      if (anchor) {
        // Messenger's own anchor handler owns its SPA route and chat state.
        // Do not use WebKit.load(), location.href, pushState, or reload().
        anchor.click();
        lastStatus = 'anchor-clicked';
      } else {
        lastStatus = 'waiting-for-conversation-row';
      }
      if (lastAttempts < MAX_ATTEMPTS) {
        setTimeout(attempt, RETRY_MS);
      } else {
        // A new route might still be settling after the final click.
        setTimeout(() => {
          if (seq === token) {
            lastStatus = current() === target ? 'route-matched' : 'not-opened';
          }
        }, RETRY_MS);
      }
    }

    attempt();
    return lastStatus;
  }

  window.__mnNotificationNavigation = {
    version: '2.0-spa',
    open,
    status() {
      return { version: '2.0-spa', status: lastStatus, attempts: lastAttempts };
    }
  };
})();

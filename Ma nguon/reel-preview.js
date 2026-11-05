/*
 * Messenger Native — Facebook Reel external routing (no embedded player).
 *
 * Keep Messenger's own thumbnail/card untouched in the chat. A user click
 * opens the target in the macOS default browser via the native Swift bridge.
 * This never creates a Facebook iframe, extracts video, or creates a WKWebView.
 */
(() => {
  if (window.__mnReelsInstalled) return;
  window.__mnReelsInstalled = true;

  const REEL_PATH = /^\/reels?\/(\d+)(?:\/|$)/i;
  const TEXT_URLS = /https?:\/\/(?:[a-z\d.-]+\.)?(?:facebook\.com|fb\.watch)\/[^\s<>"']+/gi;
  let seenClicks = 0;
  let matchedClicks = 0;
  let externalRequests = 0;
  let lastAction = 'ready';

  function externalVideoURL(input) {
    try {
      let url = new URL(input, document.baseURI);
      for (let i = 0; i < 2; i++) {
        const host = url.hostname.toLowerCase();
        if (host !== 'l.facebook.com' && host !== 'l.messenger.com') break;
        const redirect = url.searchParams.get('u');
        if (!redirect) return null;
        url = new URL(redirect);
      }
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      const host = url.hostname.toLowerCase();
      if (host === 'fb.watch') {
        return /^\/[a-z\d_-]{3,}/i.test(url.pathname) ? url.href : null;
      }
      if (!['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(host)) {
        return null;
      }
      const reel = url.pathname.match(REEL_PATH);
      if (reel) return 'https://www.facebook.com/reel/' + reel[1] + '/';

      // Shares can contain opaque non-numeric slugs and may redirect to Reels.
      // Do not guess their numeric Reel ID or generate an embedded player.
      if (/^\/share\/(?:r|v)\/[a-z\d_-]{3,}(?:\/|$)/i.test(url.pathname)) return url.href;
      if (/^\/watch\/?$/i.test(url.pathname) && url.searchParams.has('v')) return url.href;
      if (/\/videos\/\d+(?:\/|$)/i.test(url.pathname)) return url.href;
      return null;
    } catch (_) { return null; }
  }

  function urlFromText(text) {
    if (!text || text.length > 1600) return null;
    const matches = String(text).match(TEXT_URLS) || [];
    for (const match of matches.slice(0, 8)) {
      const url = externalVideoURL(match.replace(/[),.;]+$/, ''));
      if (url) return url;
    }
    return null;
  }

  function findClickedVideo(target) {
    if (!(target instanceof Element)) return null;
    if (target.closest('[contenteditable="true"], [role="textbox"]')) return null;

    let node = target;
    for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      if (node.getAttribute) {
        for (const key of ['href', 'data-href', 'data-url']) {
          const url = externalVideoURL(node.getAttribute(key) || '');
          if (url) return url;
        }
      }
      if (node.matches && node.matches('[role="link"], [role="button"]')) {
        const links = node.querySelectorAll('a[href], [data-href], [data-url]');
        for (const candidate of Array.from(links).slice(0, 12)) {
          for (const key of ['href', 'data-href', 'data-url']) {
            const url = externalVideoURL(candidate.getAttribute(key) || '');
            if (url) return url;
          }
        }
        const url = urlFromText(node.textContent || '');
        if (url) return url;
      }
    }
    // A plain Reel URL in a chat bubble without a dedicated anchor.
    node = target;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      const url = urlFromText(node.textContent || '');
      if (url) return url;
    }
    return null;
  }

  function handoff(raw) {
    const url = externalVideoURL(raw);
    if (!url) { lastAction = 'invalid-facebook-video-link'; return false; }
    const handler = window.webkit && window.webkit.messageHandlers &&
                    window.webkit.messageHandlers.vmThongBao;
    if (!handler || typeof handler.postMessage !== 'function') {
      lastAction = 'native-bridge-unavailable';
      return false; // Let regular web navigation delegate handle the click.
    }
    handler.postMessage({ moNgoaiReel: url });
    externalRequests++;
    lastAction = 'default-browser-requested';
    return true;
  }

  document.addEventListener('click', event => {
    seenClicks++;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = findClickedVideo(event.target);
    if (!url) { lastAction = 'not-a-facebook-video'; return; }
    if (!handoff(url)) return;
    matchedClicks++;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  // Kept solely for backward compatibility with native fallback callers.
  // This now requests external navigation, never an in-chat player.
  window.__mnOpenReelFromNative = handoff;
  window.__mnCanonicalReel = externalVideoURL;
  window.__mnReelStatus = () => ({
    installed: true, version: '3.0-external-only',
    seenClicks, matchedClicks, externalRequests, lastAction,
    playerVisible: false
  });
})();
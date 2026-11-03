/*
 * Messenger Native - inline Facebook Reel controller v2.
 * Inject at documentStart into the MAIN Messenger WKWebView.
 * Captures Reel clicks before React can navigate, and exposes a native fallback.
 * Uses Meta's public embed; never downloads or extracts protected video streams.
 */
(() => {
  if (window.__mnReelsInstalled) return;
  window.__mnReelsInstalled = true;

  const REEL_PATH = /^\/reels?\/(\d+)(?:\/|$)/i;
  const REEL_IN_TEXT = /https?:\/\/(?:[a-z0-9-]+\.)?facebook\.com\/reels?\/\d+(?:\/?[^\s<>"']*)?/i;
  let recentTarget = null;
  let recentAt = 0;
  let openPlayer = null;
  let seenClicks = 0;
  let matchedClicks = 0;
  let lastAction = 'ready';

  function canonicalReel(input) {
    try {
      let u = new URL(input, document.baseURI);
      for (let i = 0; i < 2; i++) {
        const host = u.hostname.toLowerCase();
        if (host !== 'l.facebook.com' && host !== 'l.messenger.com') break;
        const redirect = u.searchParams.get('u');
        if (!redirect) return null;
        u = new URL(redirect);
      }
      if (!['http:', 'https:'].includes(u.protocol)) return null;
      if (!['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(u.hostname.toLowerCase())) return null;
      const match = u.pathname.match(REEL_PATH);
      return match ? 'https://www.facebook.com/reel/' + match[1] + '/' : null;
    } catch (_) { return null; }
  }

  function urlInText(text) {
    if (!text || text.length > 1600) return null;
    const match = text.match(REEL_IN_TEXT);
    return match ? canonicalReel(match[0].replace(/[),.;]+$/, '')) : null;
  }

  function findClickedReel(target) {
    if (!(target instanceof Element)) return null;
    if (target.closest('[data-mn-reel-player], [contenteditable="true"], [role="textbox"]')) return null;

    // Most common: a link around text, preview card, image or overlay button.
    let node = target;
    for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      for (const key of ['href', 'data-href', 'data-url']) {
        const raw = node.getAttribute && node.getAttribute(key);
        const url = raw && canonicalReel(raw);
        if (url) return { url, anchor: node };
      }
      // Messenger sometimes uses role=link and a child anchor as the URL target.
      if (node.matches && node.matches('[role="link"], [role="button"]')) {
        const links = node.querySelectorAll('a[href], [data-href], [data-url]');
        for (const candidate of Array.from(links).slice(0, 12)) {
          for (const attr of ['href', 'data-href', 'data-url']) {
            const url = canonicalReel(candidate.getAttribute(attr) || '');
            if (url) return { url, anchor: node };
          }
        }
        const url = urlInText(node.textContent || '');
        if (url) return { url, anchor: node };
      }
    }
    // Plain Reel URL in a chat bubble, not represented by an <a>.
    node = target;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      const text = node.textContent || '';
      const url = urlInText(text);
      if (url) return { url, anchor: node };
    }
    return null;
  }

  function placePlayer(url, element) {
    const canonical = canonicalReel(url);
    if (!canonical || !document.body) { lastAction = 'invalid-reel-or-no-document'; return false; }

    let anchor = element instanceof Element && element.isConnected ? element : null;
    if (!anchor && recentTarget instanceof Element && recentTarget.isConnected &&
        Date.now() - recentAt < 6000) {
      const candidate = findClickedReel(recentTarget);
      if (!candidate || candidate.url === canonical) {
        anchor = (candidate && candidate.anchor) ||
          recentTarget.closest('a, [role="link"], [role="button"], div');
      }
    }
    if (!anchor) {
      // Recovery for JS-generated window.open: locate the actual URL in the DOM.
      const links = document.querySelectorAll('a[href], [data-href], [data-url]');
      for (const candidate of Array.from(links).slice(-200)) {
        const href = candidate.getAttribute('href') || candidate.getAttribute('data-href') || candidate.getAttribute('data-url');
        if (canonicalReel(href || '') === canonical) { anchor = candidate; break; }
      }
    }
    if (!anchor || !anchor.parentElement) { lastAction = 'no-chat-anchor'; return false; }

    // Do not close an existing player unless the new player has a valid target.
    if (openPlayer && openPlayer.isConnected) {
      openPlayer.__mnClose && openPlayer.__mnClose();
    }
    const panel = document.createElement('div');
    panel.dataset.mnReelPlayer = 'true';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Facebook Reel player');
    Object.assign(panel.style, {
      width: 'min(100%, 340px)', maxWidth: '100%', minWidth: '220px',
      aspectRatio: '9 / 16', position: 'relative', display: 'block',
      background: '#101010', borderRadius: '12px', overflow: 'hidden',
      margin: '6px 0'
    });

    const iframe = document.createElement('iframe');
    const embed = new URL('https://www.facebook.com/plugins/video.php');
    embed.searchParams.set('href', canonical);
    embed.searchParams.set('show_text', '0');
    embed.searchParams.set('width', '340');
    embed.searchParams.set('autoplay', '1');
    iframe.src = embed.href;
    iframe.title = 'Facebook Reel';
    iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    Object.assign(iframe.style, { width: '100%', height: '100%', border: '0', display: 'block' });

    const footer = document.createElement('div');
    Object.assign(footer.style, {
      position: 'absolute', zIndex: '3', left: '0', right: '0', bottom: '0',
      padding: '8px', display: 'flex', justifyContent: 'space-between',
      gap: '8px', background: 'linear-gradient(transparent,rgba(0,0,0,.75))'
    });
    const browser = document.createElement('button');
    browser.type = 'button';
    browser.textContent = 'Open in browser';
    browser.setAttribute('aria-label', 'Open Facebook Reel in default browser');
    browser.style.cssText = 'font:12px system-ui;cursor:pointer;background:transparent;border:0;color:white;text-decoration:underline;';
    browser.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.vmThongBao;
      if (handler) handler.postMessage({ moNgoaiReel: canonical });
    });

    let hidden = false;
    const isThumbnail = !!anchor.querySelector &&
      !!anchor.querySelector('img, picture, video, [role="img"]');
    if (isThumbnail && ['A', 'BUTTON'].includes(anchor.tagName)) {
      anchor.style.display = 'none';
      hidden = true;
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close Reel player');
    close.style.cssText = 'font:16px system-ui;cursor:pointer;border:0;background:#444;color:white;border-radius:5px;padding:2px 8px;';
    const restore = () => {
      iframe.src = 'about:blank';
      panel.remove();
      if (hidden) anchor.style.display = '';
      if (openPlayer === panel) openPlayer = null;
    };
    close.addEventListener('click', restore);
    panel.__mnClose = restore;
    footer.append(browser, close);
    panel.append(iframe, footer);
    anchor.insertAdjacentElement('afterend', panel);
    openPlayer = panel;
    lastAction = 'inline-player-inserted';
    return true;
  }

  function rememberTarget(event) {
    if (event.target instanceof Element) {
      recentTarget = event.target;
      recentAt = Date.now();
    }
  }

  document.addEventListener('pointerdown', rememberTarget, true);
  document.addEventListener('click', (event) => {
    seenClicks += 1;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey) return;
    rememberTarget(event);
    const match = findClickedReel(event.target);
    if (!match) { lastAction = 'unmatched-click'; return; }
    matchedClicks += 1;
    lastAction = 'reel-click-detected';
    event.preventDefault();
    event.stopImmediatePropagation();
    placePlayer(match.url, match.anchor);
  }, true);

  // Called by native navigation delegates when the Messenger SPA opens a
  // Reel via window.open or programmatic navigation without a normal <a> click.
  window.__mnOpenReelFromNative = (url) => placePlayer(url, null);
  window.__mnCanonicalReel = canonicalReel; // Safari Web Inspector diagnostics.
  window.__mnReelStatus = () => ({
    installed: true,
    version: '2.1-diagnostics',
    seenClicks,
    matchedClicks,
    lastAction,
    playerVisible: !!(openPlayer && openPlayer.isConnected),
    recentGesture: Date.now() - recentAt < 6000
  });
})();
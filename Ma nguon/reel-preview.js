/*
 * Inline public Facebook Reels in the EXISTING Messenger conversation WKWebView.
 * Best-effort: private/restricted embeds may refuse playback. No video scraping.
 * Text links continue to open in the system default browser.
 */
(() => {
  if (window.__messengerNativeReelsInstalled) return;
  window.__messengerNativeReelsInstalled = true;

  const reelURL = (href) => {
    try {
      const u = new URL(href, document.baseURI);
      const h = u.hostname.toLowerCase();
      if (!(h === 'facebook.com' || h.endsWith('.facebook.com'))) return null;
      if (!/^\/(reel|reels)\/[^/?#]+/i.test(u.pathname)) return null;
      return u;
    } catch (_) { return null; }
  };

  const mediaThumbnail = (target, anchor) => {
    const image = target.closest('img, video, picture, [role="img"]');
    return image && anchor.contains(image) && anchor.querySelector('img, video, picture');
  };

  function makePlayer(anchor, url) {
    const player = document.createElement('div');
    player.dataset.mnInlineReel = 'true';
    player.setAttribute('role', 'group');
    player.setAttribute('aria-label', 'Facebook Reel embedded player');
    Object.assign(player.style, {
      position: 'relative', width: 'min(100%, 340px)',
      minWidth: '220px', maxWidth: '100%', aspectRatio: '9 / 16',
      borderRadius: '12px', overflow: 'hidden', background: '#111',
      display: 'block', margin: '4px 0'
    });

    const frame = document.createElement('iframe');
    const embed = new URL('https://www.facebook.com/plugins/video.php');
    embed.searchParams.set('href', url.href);
    embed.searchParams.set('show_text', '0');
    embed.searchParams.set('width', '340');
    embed.searchParams.set('autoplay', '1');
    frame.src = embed.href;
    frame.title = 'Facebook Reel';
    frame.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    Object.assign(frame.style, { width: '100%', height: '100%', border: '0' });

    const controls = document.createElement('div');
    Object.assign(controls.style, {
      position: 'absolute', zIndex: '2', inset: 'auto 0 0 0',
      display: 'flex', justifyContent: 'space-between', gap: '8px',
      padding: '8px', background: 'linear-gradient(transparent, rgba(0,0,0,.7))'
    });
    const browser = document.createElement('a');
    browser.href = url.href;
    browser.textContent = 'Open in browser';
    browser.style.cssText = 'font:12px system-ui;color:white;text-decoration:underline;';

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close Reel and restore thumbnail');
    close.style.cssText = 'cursor:pointer;background:#333;color:white;border:0;border-radius:6px;padding:2px 8px;';
    close.addEventListener('click', () => {
      frame.src = 'about:blank';
      player.remove();
      anchor.style.display = '';
    });

    controls.append(browser, close);
    player.append(frame, controls);
    anchor.insertAdjacentElement('afterend', player);
    anchor.style.display = 'none';
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a[href]');
    if (!anchor || !mediaThumbnail(target, anchor)) return;
    const reel = reelURL(anchor.href);
    if (!reel) return;
    // Do not interfere if Messenger already created a functional inline video.
    if (anchor.querySelector('video[src], video source[src]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    makePlayer(anchor, reel);
  }, true);
})();
/*
 * Messenger Native — NotificationEngine v1
 * Best-effort DOM fallback when messenger.com does not call Notifications API
 * in WKWebView. No Web Push promise: background JS may still be suspended.
 *
 * Unlike the original timer, this engine ALWAYS tracks a snapshot while the
 * window is focused; it never marks a changed row as notified before deciding
 * whether to deliver. No first-blur or 15-second discard.
 */
(() => {
  if (window.__mnNotificationEngine) return;
  window.__mnNotificationEngine = true;
  const bridge = window.webkit && window.webkit.messageHandlers &&
                 window.webkit.messageHandlers.vmThongBao;
  const send = (payload) => { if (bridge) bridge.postMessage(payload); };
  const conversations = new Map();
  const MAX_ROWS = 75;
  const MAX_SNAPSHOT = 240;
  const MAX_PENDING = 80;
  const pending = [];
  let initialized = false;
  let observedRoot = null;
  let observer = null;
  let scheduled = false;
  let flushing = false;
  let lastEvent = 'initializing';
  let scans = 0;
  let sent = 0;
  let seq = 0;

  const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();
  const metadata = (text) => /^(?:\d+\s*(?:giây|phút|giờ|ngày|tuần|tháng|năm|s|m|h|d|w)\s*(?:trước|ago)?|just now|vừa xong|active now|đang hoạt động|·)$/i.test(text);
  const isForeground = () => !document.hidden && document.hasFocus();

  // Messenger can put an accessibility/status label such as "Unread message"
  // inside the conversation anchor's rendered text. It is a UI marker, not
  // message content, and makes macOS banners unnecessarily verbose.
  // Only remove a standalone status line that is NOT the final preview line:
  // if somebody literally sends "Unread message", keep that message intact.
  const unreadStatusLine = /^(?:(?:\d+\s+)?unread\s+messages?|(?:\d+\s+)?tin\s+nhắn\s+chưa\s+đọc)$/i;
  function cleanPreviewLines(parts) {
    return parts.filter((part, index) =>
      !(unreadStatusLine.test(part) && index <= 1 && index < parts.length - 1));
  }

  // Messenger sometimes renders Unicode emoji as small inline <img alt="😊">
  // or <span role="img" aria-label="👨‍👩‍👧"> rather than text nodes.
  // innerText/textContent omit those images, producing incomplete banners.
  // Recognize actual emoji codepoints only: never substitute avatar names,
  // arbitrary image alt text, stickers or attached media descriptions.
  const emojiCodepoint = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u;
  const emojiOnly = /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0e\ufe0f\u20e3#*0-9\s]+$/u;
  const blockTag = /^(?:DIV|P|LI|SECTION|ARTICLE|HEADER|FOOTER|H[1-6])$/;

  function emojiAlt(node) {
    if (!node || typeof node.getAttribute !== 'function') return '';
    const tag = String(node.tagName || '').toUpperCase();
    const role = node.getAttribute('role');
    if (tag !== 'IMG' && role !== 'img') return '';
    const raw = normalize(node.getAttribute('alt') || node.getAttribute('aria-label') ||
                          node.getAttribute('data-emoji') || '');
    return raw.length > 0 && raw.length <= 80 &&
           emojiCodepoint.test(raw) && emojiOnly.test(raw) ? raw : '';
  }

  function textWithInlineEmoji(element) {
    if (typeof element.querySelectorAll !== 'function' || !element.childNodes) return null;
    const candidates = element.querySelectorAll('img[alt], [role="img"][aria-label], [data-emoji]');
    if (!Array.from(candidates).some(emojiAlt)) return null;

    let visited = 0;
    let recovered = 0;
    const tokens = [];
    function visit(node, depth) {
      if (!node || ++visited > 350 || depth > 32) return;
      if (node.nodeType === 3) {
        tokens.push((node.nodeValue || '').replace(/\s+/g, ' '));
        return;
      }
      if (node.nodeType !== 1) return;

      const tag = String(node.tagName || '').toUpperCase();
      const emoji = emojiAlt(node);
      if (emoji) {
        tokens.push(emoji);
        recovered++;
        return;
      }
      if (/^(?:IMG|SVG|SCRIPT|STYLE|NOSCRIPT)$/.test(tag)) return;
      if (node !== element) {
        if (node.hidden || (node.getAttribute && node.getAttribute('aria-hidden') === 'true')) return;
        if (typeof getComputedStyle === 'function') {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return;
        }
      }
      if (tag === 'BR') { tokens.push('\n'); return; }
      const block = node !== element && blockTag.test(tag);
      if (block) tokens.push('\n');
      for (const child of node.childNodes || []) visit(child, depth + 1);
      if (block) tokens.push('\n');
    }
    visit(element, 0);
    return recovered ? tokens.join('') : null;
  }

  function textLines(element) {
    const raw = textWithInlineEmoji(element) || (element.innerText || element.textContent || '');
    const parts = raw.split(/\n/).map(normalize).filter((part) => part && !metadata(part));
    return cleanPreviewLines(parts);
  }

  function unread(row) {
    if (row.getAttribute('aria-label') &&
        /\b(unread|chưa đọc)\b/i.test(row.getAttribute('aria-label'))) return true;
    // Unread conversation titles/previews are styled bold in the current UI.
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let node, count = 0;
    while ((node = walker.nextNode()) && count++ < 65) {
      if (!normalize(node.textContent) || !node.parentElement) continue;
      const weight = getComputedStyle(node.parentElement).fontWeight;
      if (weight === 'bold' || (parseInt(weight, 10) || 0) >= 600) return true;
    }
    return false;
  }

  function parse(row, index) {
    const anchor = row.querySelector('a[href*="/t/"]');
    if (!anchor) return null;
    let url;
    try {
      url = new URL(anchor.getAttribute('href'), location.href);
      if (!/^\/t\/[^/]+/.test(url.pathname)) return null;
    } catch (_) { return null; }
    const parts = textLines(anchor);
    if (!parts.length) return null;
    const title = parts[0].slice(0, 110) || 'Messenger';
    let preview = normalize(parts.slice(1).join(' ')).slice(0, 500);
    if (!preview) preview = 'Tin nhắn mới';

    // A sender prefix is reliably extracted only when Messenger shows it.
    // Never claim that the sender was determined when it wasn't visible.
    let sender = '';
    const groupLike = row.querySelectorAll('img').length >= 2 ||
                      !!row.querySelector('[aria-label*="group"], [aria-label*="nhóm"]');
    const match = preview.match(/^([^:]{1,75}):\s*(.{1,500})$/);
    if (groupLike && match && !/^(you|bạn)$/i.test(match[1].trim())) {
      sender = normalize(match[1]);
      preview = normalize(match[2]);
    }
    return {
      path: url.pathname,
      title,
      sender,
      preview,
      unread: unread(row),
      index,
      signature: preview + '\u001f' + sender
    };
  }

  function enqueue(item) {
    if (window.__vmCaiDat && window.__vmCaiDat.baoTinNhan === false) return;
    if (window.__vmCaiDat && window.__vmCaiDat.boTinGoi !== false &&
        Date.now() - (window.__vmGoiLuc || 0) < 8000 &&
        /cuộc gọi|gọi video|gọi thoại|\bcall/i.test(item.preview) &&
        !/nhỡ|bỏ lỡ|missed/i.test(item.preview)) return;
    if (pending.length >= MAX_PENDING) {
      // Bounded queue, log overload rather than silently marking everything sent.
      lastEvent = 'queue-full';
      send({ nhatKy: 'MN NOTI: queue full; DOM fallback cannot guarantee all messages' });
      return;
    }
    pending.push(item);
    drain();
  }

  function drain() {
    if (flushing || !pending.length) return;
    flushing = true;
    const tick = () => {
      const item = pending.shift();
      if (item) {
        send({
          id: 'mn-' + Date.now() + '-' + (++seq),
          tieuDe: item.title,
          phuDe: item.sender,
          noiDung: item.preview,
          tag: item.path,
          duongDan: item.path,
          nguon: 'dom'
        });
        sent += 1;
        lastEvent = 'sent-dom-notification';
      }
      if (pending.length) setTimeout(tick, 90);
      else flushing = false;
    };
    tick();
  }

  function scan(reason) {
    scheduled = false;
    if (/groupcall/.test(location.pathname)) return;
    scans += 1;
    const rows = Array.from(document.querySelectorAll('[role="row"]')).slice(0, MAX_ROWS);
    if (!rows.length) { lastEvent = 'no-conversation-rows'; return; }
    const now = Date.now();
    const current = rows.map((row, index) => parse(row, index)).filter(Boolean);
    if (!current.length) { lastEvent = 'rows-no-chat-links'; return; }
    const foreground = isForeground();
    if (!initialized) {
      for (const item of current) {
        conversations.set(item.path, { ...item, lastSeen: now });
      }
      initialized = true;
      lastEvent = 'baseline-created';
      send({ nhatKy: 'MN NOTI: initial snapshot created (' + current.length + ' rows)' });
      return;
    }
    let changes = 0;
    for (const item of current) {
      const old = conversations.get(item.path);
      const changed = !old || old.signature !== item.signature || (!old.unread && item.unread);
      // A previously unseen row at the top is eligible; old rows exposed by
      // scrolling or list virtualization further down are not treated as new.
      const eligible = old ? changed : item.index < 6;
      if (!foreground && item.unread && eligible && changed) {
        changes += 1;
        enqueue(item);
      }
      conversations.delete(item.path);
      conversations.set(item.path, { ...item, lastSeen: now });
    }
    // Keep recently virtualized rows as a baseline; bound storage.
    for (const [key, value] of conversations) {
      if (now - value.lastSeen > 30 * 60 * 1000) conversations.delete(key);
    }
    while (conversations.size > MAX_SNAPSHOT) {
      const first = conversations.keys().next().value;
      conversations.delete(first);
    }
    if (changes) lastEvent = reason + ': ' + changes + ' new previews';
  }

  function schedule(reason) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => scan(reason), 180);
  }

  function bindObserver() {
    const first = document.querySelector('[role="row"]');
    const root = first && (first.closest('[role="grid"], [role="list"], [role="navigation"]') ||
                           first.parentElement && first.parentElement.parentElement);
    if (!root || root === observedRoot) return;
    if (observer) observer.disconnect();
    observedRoot = root;
    observer = new MutationObserver(() => schedule('mutation'));
    observer.observe(root, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'style', 'aria-label']
    });
    schedule('observer-bound');
  }

  document.addEventListener('visibilitychange', () => schedule('visibility'), true);
  window.addEventListener('focus', () => schedule('focus'), true);
  window.addEventListener('blur', () => schedule('blur'), true);

  // Observer is primary; polling is the low-frequency recovery path.
  setInterval(() => { bindObserver(); schedule('recovery'); }, 3500);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindObserver(); schedule('dom-ready');
    }, { once: true });
  } else {
    bindObserver(); schedule('already-ready');
  }

  window.__mnNotificationStatus = () => ({
    version: '1.0',
    initialized, scans, sent, pending: pending.length,
    trackedConversations: conversations.size,
    observerAttached: !!observer, lastEvent
  });
})();
/*
 * Messenger Native — NotificationEngine v1
 * Best-effort DOM fallback when messenger.com does not call Notifications API
 * in WKWebView. No Web Push promise: background JS may still be suspended.
 *
 * Detection is independent of foreground/background/focus state. The
 * macOS Notification Center decides whether a banner/sound is presented.
 * The initial snapshot remains silent; unread changes alone are not new
 * messages. Open conversations can show incoming previews as read immediately.
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
  let foregroundSent = 0;
  let selectedChatSent = 0;
  let selfMessageSkipped = 0;
  let draftSkipped = 0;
  let localSendSkipped = 0;
  let dockBadgeCount = null;
  let dockBadgeState = 'initializing';
  let dockRowsVisible = 0;
  let dockBadgeUpdates = 0;
  let unknownRowsBaselined = 0;
  let staleCandidatesBlocked = 0;
  let relativeTimeChangesBlocked = 0;
  let inlineTimestampsRemoved = 0;
  const recentLocalText = new Map();
  // Keep only fingerprints of messages explicitly submitted by the user.
  // A sent preview can arrive well after the original 12s typing window,
  // or reappear when Messenger redraws a conversation row. All raw text
  // stays in this page's memory and is NEVER posted to Swift or logs.
  const recentLocalSends = new Map();
  // Unsent drafts are NOT messages. Keep them independently of the old 12s
  // outgoing-preview fingerprint, which can be consumed by one scan.
  // Content never leaves this page; no body, hash or length enters logs.
  const unsentLocalDrafts = new Map();
  // Editor nodes can linger across SPA chat switches. Never interpret the
  // former conversation's focused editor as a draft in the new thread.
  let lastEditorElement = null;
  let lastEditorPath = '';
  let lastEditorWasSubmitted = false;
  const LOCAL_DRAFT_TTL_MS = 10 * 60 * 1000;
  const LOCAL_TEXT_TTL_MS = 12000;
  const LOCAL_SENT_TTL_MS = 90000;
  const MAX_LOCAL_TEXTS = 8;
  const MAX_SENT_PER_THREAD = 4;
  let outgoingWebSuppressed = 0;
  let draftLabelSkipped = 0;
  let draftComposerSkipped = 0;
  let draftWebSuppressed = 0;

  const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();
  const metadata = (text) => /^(?:\d+\s*(?:giây|phút|giờ|ngày|tuần|tháng|năm|s|m|h|d|w)\s*(?:trước|ago)?|just now|vừa xong|active now|đang hoạt động|·)$/i.test(text);
  const isForeground = () => !document.hidden && document.hasFocus();
  const normalizedPath = path => String(path || '').replace(/\/+$/, '');
  const currentlySelected = path =>
    normalizedPath(path) === normalizedPath(location.pathname);

  // Common first-person prefixes used by Messenger's conversation preview
  // for an outgoing message. This is a conservative UI hint, not a trusted
  // server-side sender identity. A message lacking an explicit marker cannot
  // be reliably classified from the conversation list alone.
  const ownPreview = /^(?:you|bạn)\s*[:：·]|^(?:you\s+(?:sent|reacted|replied)|bạn\s+(?:đã gửi|đã bày tỏ|đã trả lời))\b/i;
  const looksSelfAuthored = preview => ownPreview.test(normalize(preview));
  // Messenger replaces its conversation-list preview with an unsent local
  // composer draft ("Draft: …", "Bản nháp: …"). This is a UI-state
  // change, NOT a new incoming message. Check the prefix before parsing
  // group sender labels; otherwise a group can mistakenly become "Draft".
  // Messenger may render the draft marker as "Draft: …", "Draft · …",
  // "Nháp — …" or as a standalone UI line above the draft. Do not treat
  // words such as "Drafting" as a marker.
  const draftPrefix = /^(?:draft|bản\s+nháp|nháp)(?:\s*[:：·—–-]\s*|\s*$)/i;
  const draftLabel = /^(?:draft|bản\s+nháp|nháp)\s*[:：·—–-]?\s*$/i;
  const isDraftPreview = preview => draftPrefix.test(normalize(preview));

  // A selected conversation can be marked READ immediately. Its sidebar
  // preview then changes for BOTH inbound and self-authored messages. Labels
  // such as "You:" are not always present, so record a short-lived in-memory
  // fingerprint of text the user actually typed in the chat composer.
  // Never send composer text to Swift, logs, preferences or a network API.
  function composerFor(target) {
    if (!target || typeof target.closest !== 'function') return null;
    const editor = target.closest('[contenteditable="true"], textarea');
    if (!editor) return null;
    const label = normalize((editor.getAttribute && (
      editor.getAttribute('aria-label') || editor.getAttribute('placeholder')
    )) || '').toLowerCase();
    if (/search|tìm kiếm|tìm trên/.test(label)) return null;
    if (!/^\/t\/[^/]+/.test(location.pathname)) return null;
    return editor;
  }

  function composerText(editor) {
    return normalize((editor && (editor.innerText || editor.value ||
      editor.textContent)) || '').slice(0, 500);
  }

  // Normalize optional first-person rendering in the sidebar. Do not erase
  // arbitrary sender names: they are not proof of an outgoing message.
  const withoutOwnPrefix = text =>
    normalize(text).replace(/^(?:you|bạn)\s*[:：·]\s*/i, '');

  function matchesOutgoing(preview, actual) {
    const visible = withoutOwnPrefix(preview);
    return visible === actual ||
      (visible.endsWith('…') && visible.length >= 16 &&
       actual.startsWith(visible.slice(0, -1)));
  }

  function matchesDraft(preview, actual) {
    const plain = normalize(preview);
    return matchesOutgoing(plain, actual) ||
      (isDraftPreview(plain) &&
       matchesOutgoing(plain.replace(draftPrefix, ''), actual));
  }

  // Prefer a live, visible composer when available. This also catches
  // restored drafts and IME/autofill changes that bypass an 'input' event.
  // Read at most a few candidate editors; never enumerate message bubbles.
  function liveComposerDraft(path) {
    if (!currentlySelected(path)) return '';
    const trustworthy = editor => !!editor &&
      editor.isConnected !== false &&
      !(editor === lastEditorElement &&
        (lastEditorPath !== path || lastEditorWasSubmitted));
    const focused = composerFor(document.activeElement);
    if (trustworthy(focused)) return composerText(focused);
    if (typeof document.querySelectorAll !== 'function') return '';
    const editors = Array.from(document.querySelectorAll(
      '[contenteditable="true"], textarea'
    )).slice(0, 8);
    for (const editor of editors) {
      const local = composerFor(editor);
      if (trustworthy(local)) {
        const text = composerText(local);
        if (text) return text;
      }
    }
    return '';
  }

  function matchesUnsentDraft(path, preview) {
    const normalized = normalizedPath(path);
    const live = liveComposerDraft(normalized);
    if (live && matchesDraft(preview, live)) return true;
    const candidate = unsentLocalDrafts.get(normalized);
    if (!candidate) return false;
    if (Date.now() - candidate.timestamp > LOCAL_DRAFT_TTL_MS) {
      unsentLocalDrafts.delete(normalized);
      return false;
    }
    return matchesDraft(preview, candidate.text);
  }

  function rememberLocalText(editor, sendIntent) {
    const text = composerText(editor);
    const path = normalizedPath(location.pathname);
    if (!text) {
      recentLocalText.delete(path);
      unsentLocalDrafts.delete(path);
      return;
    }
    if (isDraftPreview(text)) return;
    lastEditorElement = editor;
    lastEditorPath = path;
    lastEditorWasSubmitted = !!sendIntent;
    if (sendIntent) unsentLocalDrafts.delete(path);
    else {
      unsentLocalDrafts.delete(path);
      unsentLocalDrafts.set(path, { text, timestamp: Date.now() });
      while (unsentLocalDrafts.size > MAX_LOCAL_TEXTS) {
        unsentLocalDrafts.delete(unsentLocalDrafts.keys().next().value);
      }
    }
    const previous = recentLocalText.get(path);
    const timestamp = Date.now();
    recentLocalText.delete(path);
    recentLocalText.set(path, {
      text, timestamp, sendIntent: !!sendIntent || !!(
        previous && previous.text === text && previous.sendIntent
      ), consumed: false
    });
    if (sendIntent) {
      const history = (recentLocalSends.get(path) || []).filter(item =>
        timestamp - item.timestamp < LOCAL_SENT_TTL_MS
      );
      history.push({ text, timestamp });
      recentLocalSends.delete(path);
      recentLocalSends.set(path, history.slice(-MAX_SENT_PER_THREAD));
      while (recentLocalSends.size > MAX_LOCAL_TEXTS) {
        recentLocalSends.delete(recentLocalSends.keys().next().value);
      }
    }
    while (recentLocalText.size > MAX_LOCAL_TEXTS) {
      recentLocalText.delete(recentLocalText.keys().next().value);
    }
  }

  function recentLocalMatch(item) {
    const path = normalizedPath(item.path);
    const now = Date.now();
    const history = (recentLocalSends.get(path) || []).filter(sent =>
      now - sent.timestamp <= LOCAL_SENT_TTL_MS
    );
    if (history.length) recentLocalSends.set(path, history);
    else recentLocalSends.delete(path);
    if (history.some(sent => matchesOutgoing(item.preview, sent.text))) return true;

    // Typing-only fingerprint protects very short optimistic DOM changes,
    // but is never allowed to hide later inbound messages.
    const candidate = recentLocalText.get(path);
    if (!candidate || candidate.consumed ||
        now - candidate.timestamp > LOCAL_TEXT_TTL_MS) return false;
    const matched = matchesOutgoing(item.preview, candidate.text);
    if (matched) candidate.consumed = true;
    return matched;
  }

  // The page's Web Notification API is a second, independent notification
  // source. Suppress only EXACT content matching a recent explicit local Send.
  // A missing Web tag is allowed only in a narrow 10s interval in the open chat.
  window.__mnIsOwnSentNotification = (body, tag) => {
    const tagPath = normalizedPath(tag);
    const selected = normalizedPath(location.pathname);
    const path = /^\/t\/[^/]+/.test(tagPath) ? tagPath : selected;
    if (!/^\/t\/[^/]+/.test(path)) return false;

    const now = Date.now();
    const maxAge = tagPath === path ? LOCAL_SENT_TTL_MS : 10000;
    const sent = (recentLocalSends.get(path) || []).some(item =>
      now - item.timestamp <= maxAge && matchesOutgoing(body, item.text)
    );
    if (sent) {
      outgoingWebSuppressed += 1;
      return true;
    }
    // The editor can still contain the sent text for a React render tick.
    // Explicit Send evidence takes precedence over unsent composer state.
    // Never suppress another chat's Web Notification by global focus alone.
    if (matchesUnsentDraft(path, body) && (tagPath === path || selected === path)) {
      draftWebSuppressed += 1;
      return true;
    }
    return false;
  };

  document.addEventListener('input', event => {
    const editor = composerFor(event.target);
    if (editor) rememberLocalText(editor, false);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing ||
        event.ctrlKey || event.metaKey || event.altKey) return;
    const editor = composerFor(event.target);
    if (editor) rememberLocalText(editor, true);
  }, true);

  // Send-button taps can blur the composer before click handlers run. Keep
  // the candidate captured by prior input even when the button has no label.
  document.addEventListener('pointerdown', event => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const button = target.closest('button, [role="button"]');
    if (!button || typeof button.getAttribute !== 'function') return;
    const label = normalize([
      button.getAttribute('aria-label'), button.getAttribute('title'),
      button.getAttribute('data-testid')
    ].filter(Boolean).join(' ')).toLowerCase();
    if (!/^(send|gửi)(?:\s|$)/.test(label)) return;
    const editor = composerFor(document.activeElement);
    if (editor) rememberLocalText(editor, true);
  }, true);

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


  // Messenger renders the chat age (e.g. "6m") inside some conversation
  // anchors, sometimes on the SAME visual/text line as the message preview.
  // The age advances once a minute even without a new message.
  // A standalone metadata() filter is insufficient for this layout.
  const trailingAge = /^(.+?\S)\s+(\d{1,3}\s*(?:giây|phút|giờ|ngày|tuần|tháng|năm|[smhdwy])(?:\s*(?:trước|ago))?)$/i;
  const ageUnits = {
    s: 1 / 60, giây: 1 / 60,
    m: 1, phút: 1,
    h: 60, giờ: 60,
    d: 1440, ngày: 1440,
    w: 10080, tuần: 10080,
    tháng: 43200,
    y: 525600, năm: 525600
  };
  function splitTrailingAge(text) {
    const match = normalize(text).match(trailingAge);
    if (!match) return null;
    const age = normalize(match[2]);
    const units = age.match(/^(\d{1,3})\s*(giây|phút|giờ|ngày|tuần|tháng|năm|[smhdwy])/i);
    if (!units) return null;
    const factor = ageUnits[units[2].toLowerCase()];
    if (!factor) return null;
    return { content: normalize(match[1]), age, minutes: Number(units[1]) * factor };
  }

  // Only remove an age from a notification body if the DOM ALSO has a
  // separate leaf element containing that same age. This protects genuine
  // messages such as "See you in 5m" from having their content truncated.
  function hasIsolatedAgeNode(anchor, age) {
    if (typeof anchor.querySelectorAll !== 'function') return false;
    const leaves = Array.from(anchor.querySelectorAll('time, abbr, span, [datetime]')).slice(-50);
    return leaves.some(node =>
      (!node.childElementCount || node.childElementCount === 0) &&
      normalize(node.textContent || node.innerText) === age
    );
  }

  // If the Web UI does not expose a separate timestamp leaf, suppress only
  // the specific ageing transition of the SAME preview. Do not suppress a
  // real changed body or a new conversation merely because it ends in "m".
  function isAgeOnlyChange(previous, current) {
    if (!previous || !current || previous.sender !== current.sender ||
        previous.isDraft || current.isDraft) return false;
    const oldAge = splitTrailingAge(previous.preview);
    const newAge = splitTrailingAge(current.preview);
    return !!oldAge && !!newAge &&
      oldAge.content === newAge.content &&
      newAge.minutes > oldAge.minutes;
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
    const age = splitTrailingAge(preview);
    if (age && hasIsolatedAgeNode(anchor, age.age)) {
      preview = age.content;
      inlineTimestampsRemoved += 1;
    }
    // A standalone "Draft" accessibility/text line is normalized into
    // "Draft message" by the sidebar text parser; catch it BEFORE flattening
    // the rest of the row into a message body.
    const isDraft = isDraftPreview(preview) ||
      parts.slice(1).some(part => draftLabel.test(part));

    // A sender prefix is reliably extracted only when Messenger shows it.
    // Never claim that the sender was determined when it wasn't visible.
    let sender = '';
    const groupLike = row.querySelectorAll('img').length >= 2 ||
                      !!row.querySelector('[aria-label*="group"], [aria-label*="nhóm"]');
    const match = preview.match(/^([^:]{1,75}):\s*(.{1,500})$/);
    if (groupLike && match && !/^(you|bạn|draft|bản nháp|nháp)$/i.test(match[1].trim())) {
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
      signature: preview + '\u001f' + sender,
      selfAuthored: looksSelfAuthored(preview),
      isDraft,
      draftContent: isDraft ? normalize(preview.replace(draftPrefix, '')) : ''
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
        if (item.foreground) foregroundSent += 1;
        if (item.selectedChat) selectedChatSent += 1;
        lastEvent = 'sent-dom-notification';
      }
      if (pending.length) setTimeout(tick, 90);
      else flushing = false;
    };
    tick();
  }

  // A Dock badge is a count of rendered unread CONVERSATIONS, not the
  // separate Chats navigation tab's "N unread messages" accessibility
  // label. That label can include items not visible in this list and has
  // different semantics. Never fabricate a global unread count.
  function publishDockBadge(items) {
    const observable = Array.isArray(items) && items.length > 0;
    const count = observable ? new Set(items.filter(item => item.unread)
      .map(item => item.path)).size : null;
    const state = observable ? 'rendered-conversations' : 'unknown';
    const visibleRows = observable ? items.length : 0;
    if (state === dockBadgeState && count === dockBadgeCount &&
        visibleRows === dockRowsVisible) return;
    dockBadgeState = state;
    dockBadgeCount = count;
    dockRowsVisible = visibleRows;
    dockBadgeUpdates += 1;
    send({
      nguonBadge: state,
      soChuaDoc: count === null ? 0 : count,
      soDongHienThi: visibleRows
    });
  }

  function scan(reason) {
    scheduled = false;
    if (/groupcall/.test(location.pathname)) return;
    scans += 1;
    const rows = Array.from(document.querySelectorAll('[role="row"]')).slice(0, MAX_ROWS);
    if (!rows.length) {
      publishDockBadge(null); // clear stale Dock badge during transitions
      lastEvent = 'no-conversation-rows';
      return;
    }
    const now = Date.now();
    const current = rows.map((row, index) => parse(row, index)).filter(Boolean);
    if (!current.length) {
      publishDockBadge(null);
      lastEvent = 'rows-no-chat-links';
      return;
    }
    publishDockBadge(current);
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
      // An unread badge changing by itself (e.g. "Mark as unread") is NOT
      // proof that a new message arrived. Only a changed preview is eligible.
      const clockOnly = !!old && old.signature !== item.signature &&
        isAgeOnlyChange(old, item);
      if (clockOnly) relativeTimeChangesBlocked += 1;
      const previewChanged = !!old && old.signature !== item.signature && !clockOnly;
      // A row appearing at the top is NOT proof that a new message arrived:
      // Messenger may reorder, virtualize or restore old unread conversations.
      // Previously we treated every unseen top-six unread row as fresh,
      // causing backlog notifications when opening an existing chat.
      if (!old) unknownRowsBaselined += 1;
      const selected = currentlySelected(item.path);
      // A currently opened chat is marked read as soon as the new message
      // renders, even if the app is foregrounded or merely visible. Its
      // preview can still prove that the conversation changed.
      const activeIncoming = selected && previewChanged;
      // When the user's typed draft becomes the same sent-message preview,
      // the sidebar may omit the usual "You:" marker. Match exact local
      // draft content, rather than suppressing arbitrary read messages.
      const submittedLocalDraft = !!old && old.isDraft && !item.isDraft &&
        selected && !item.unread && !!old.draftContent &&
        normalize(item.preview) === old.draftContent;
      // Real local user input is a stronger signal than Messenger's optional
      // "You:" prefix and works when Draft: transitions are not observed.
      const eligible = previewChanged;
      if (!old && item.unread) staleCandidatesBlocked += 1;
      // Do not consume a local-send fingerprint during a no-change scan.
      // A send can complete before React clears the contenteditable editor;
      // it must be classified as sent, not as an unsent draft.
      const sentFromLocalComposer = eligible && !item.isDraft &&
        !submittedLocalDraft && recentLocalMatch(item);
      const unsentDraft = eligible && !item.isDraft &&
        !submittedLocalDraft && !sentFromLocalComposer &&
        matchesUnsentDraft(item.path, item.preview);
      if (eligible && (item.unread || activeIncoming)) {
        if (item.isDraft) {
          // Explicit UI draft marker, never an inbound message.
          draftSkipped += 1;
          draftLabelSkipped += 1;
          lastEvent = 'draft-change-suppressed';
        } else if (unsentDraft) {
          // Unlabelled draft matches an actual unsent local composer.
          draftSkipped += 1;
          draftComposerSkipped += 1;
          lastEvent = 'draft-composer-suppressed';
        } else if (submittedLocalDraft) {
          draftSkipped += 1;
          lastEvent = 'draft-send-suppressed';
        } else if (sentFromLocalComposer) {
          localSendSkipped += 1;
          lastEvent = 'local-send-suppressed';
        } else if (item.selfAuthored) {
          selfMessageSkipped += 1;
        } else {
          changes += 1;
          enqueue({ ...item, foreground, selectedChat: selected });
        }
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
    version: '1.1-all-window-states',
    initialized, scans, sent, pending: pending.length,
    foregroundSent, selectedChatSent, selfMessageSkipped, draftSkipped,
    localSendSkipped, outgoingWebSuppressed,
    draftLabelSkipped, draftComposerSkipped, draftWebSuppressed,
    dockBadgeState, dockBadgeCount, dockRowsVisible, dockBadgeUpdates,
    unknownRowsBaselined, staleCandidatesBlocked,
    relativeTimeChangesBlocked, inlineTimestampsRemoved,
    trackedConversations: conversations.size,
    observerAttached: !!observer, lastEvent
  });
})();
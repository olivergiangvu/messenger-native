'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'notification-engine.js'), 'utf8');
new vm.Script(source, { filename: 'notification-engine.js' });

const messages = [];
const timeouts = [];
const intervals = [];
let mutationCallback;
let rows = [];
let hidden = false;
let focused = true;
let currentPath = '/';
let fakeNow = Date.now();
const documentListeners = new Map();

const observerRoot = {};
const row = (href, title, preview, unread = true, group = false, ageLeaf = '') => ({
  getAttribute(attr) {
    return attr === 'aria-label' ? unread ? '2 tin nhắn chưa đọc' : '' : null;
  },
  querySelector(selector) {
    if (selector !== 'a[href*="/t/"]') return null;
    return {
      innerText: title + '\n' + preview,
      getAttribute: () => href,
      querySelectorAll: () => ageLeaf
        ? [{ textContent: ageLeaf, childElementCount: 0 }] : []
    };
  },
  querySelectorAll() { return Array(group ? 2 : 1).fill({}); },
  closest() { return observerRoot; },
});

const document = {
  readyState: 'complete',
  get hidden() { return hidden; },
  hasFocus() { return focused; },
  querySelector(sel) { return sel === '[role="row"]' ? rows[0] || null : null; },
  querySelectorAll(sel) { return sel === '[role="row"]' ? rows : []; },
  createTreeWalker() { return { nextNode() { return null; } }; },
  activeElement: null,
  addEventListener(type, callback) {
    if (!documentListeners.has(type)) documentListeners.set(type, []);
    documentListeners.get(type).push(callback);
  }
};

const emitDocument = (type, event) => {
  for (const fn of documentListeners.get(type) || []) fn(event);
};
const makeComposer = text => {
  const editor = {
    innerText: text,
    getAttribute(key) {
      return key === 'aria-label' ? 'Message composer' : null;
    },
    closest(selector) {
      return selector.includes('contenteditable') ? this : null;
    }
  };
  document.activeElement = editor;
  return editor;
};

const window = {
  webkit: { messageHandlers: { vmThongBao: { postMessage(value) { messages.push(value); } } } },
  __vmCaiDat: { baoTinNhan: true, boTinGoi: true },
  addEventListener() {}
};

class MutationObserver {
  constructor(callback) { mutationCallback = callback; }
  observe() {}
  disconnect() {}
}
const runTimers = () => {
  let count = 0;
  while (timeouts.length) {
    if (++count > 300) throw new Error('Timer did not drain');
    timeouts.shift()();
  }
};
vm.runInNewContext(source, {
  window, document, location: { href: 'https://www.messenger.com', get pathname() { return currentPath; } },
  MutationObserver, NodeFilter: { SHOW_TEXT: 4 },
  getComputedStyle: () => ({ fontWeight: '400' }),
  setTimeout(callback) { timeouts.push(callback); },
  setInterval(callback) { intervals.push(callback); },
  Date: { now: () => fakeNow },
  URL,
});

const received = () => messages.filter((item) => item.id && item.nguon === 'dom');
rows = [
  row('/t/alice', 'Alice', 'Old preview'),
  row('/t/bob', 'Bob', 'Old Bob preview'),
  row('/t/carol', 'Carol', 'Old Carol preview'),
  row('/t/david', 'David', 'Old David preview'),
  row('/t/group', 'Project Group', 'Minh: Old document', true, true)
];
intervals[0]();  // Bind observer once rows exist.
runTimers();
assert.equal(window.__mnNotificationStatus().initialized, true);
assert.equal(received().length, 0, 'Initial load must not flood old unread previews');

// An unread row brought into the top of the list during scrolling, an
// archived chat becoming visible, or WebKit restoration is not a new event.
rows = [
  row('/t/archived', 'Old unread conversation', 'An old 21-minute message', true),
  row('/t/alice', 'Alice', 'Old preview'),
  row('/t/bob', 'Bob', 'Old Bob preview')
];
mutationCallback();
runTimers();
assert.equal(received().length, 0,
  'A previously unseen top unread chat must be baselined, never reported as fresh');
assert.equal(window.__mnNotificationStatus().staleCandidatesBlocked, 1);

// First update after losing focus must notify; no "first blur" discard.
hidden = true;
focused = false;
rows = [
  row('/t/alice', 'Alice', 'New preview'),
  row('/t/bob', 'Bob', 'First message')
];
mutationCallback();
runTimers();
assert.equal(received().length, 2);

// More than three changed conversations in a single scan must not be lost.
rows = [
  row('/t/alice', 'Alice', 'Changed again'),
  row('/t/bob', 'Bob', 'Changed again'),
  row('/t/carol', 'Carol', 'New'),
  row('/t/david', 'David', 'New'),
  row('/t/group', 'Project Group', 'Minh: New document', true, true),
];
mutationCallback();
runTimers();
assert.equal(received().length, 7, 'Must deliver all five changes, not just three');
const group = received().find((item) => item.tag === '/t/group');
assert.equal(group.tieuDe, 'Project Group');
assert.equal(group.phuDe, 'Minh');
assert.equal(group.noiDung, 'New document');

// Focused window must still receive a native message notification.
hidden = false;
focused = true;
rows = [row('/t/alice', 'Alice', 'Read while foreground')];
mutationCallback();
runTimers();
assert.equal(received().length, 8, 'Focus cannot suppress a new unread preview');
assert.equal(received().at(-1).noiDung, 'Read while foreground');
assert.equal(window.__mnNotificationStatus().foregroundSent, 1);

// Window visible on screen, but another app is focused.
hidden = false;
focused = false;
rows = [row('/t/alice', 'Alice', 'Visible without focus')];
mutationCallback();
runTimers();
assert.equal(received().length, 9, 'Visible unfocused window must notify');

// Window is backgrounded / minimized, as before.
hidden = true;
focused = false;
rows = [row('/t/alice', 'Alice', 'Next after blur')];
mutationCallback();
runTimers();
assert.equal(received().length, 10, 'Background message notification must remain reliable');

// A status badge generated by Messenger must NOT become the banner title or
// the first words of its body. Preserve the user's actual content verbatim.
rows = [row('/t/alice', 'Unread message\nAlice', 'A genuinely new message')];
mutationCallback();
runTimers();
assert.equal(received().length, 11);
assert.equal(received().at(-1).tieuDe, 'Alice');
assert.equal(received().at(-1).noiDung, 'A genuinely new message');

rows = [row('/t/alice', 'Alice', 'Unread message\nAnother new message')];
mutationCallback();
runTimers();
assert.equal(received().length, 12);
assert.equal(received().at(-1).noiDung, 'Another new message');

// An actual user can write the words "Unread message": do not strip it when
// it is the final/only preview line, not a separate status badge.
rows = [row('/t/alice', 'Alice', 'Unread message')];
mutationCallback();
runTimers();
assert.equal(received().length, 13);
assert.equal(received().at(-1).noiDung, 'Unread message');

// Current thread is open and auto-marked read: detect the changed preview
// anyway, regardless of whether WKWebView has focus.
currentPath = '/t/alice';
hidden = false;
focused = true;
rows = [row('/t/alice', 'Alice', 'Incoming in open chat', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 14, 'Read incoming message in selected thread still notifies');
assert.equal(received().at(-1).noiDung, 'Incoming in open chat');
assert.equal(window.__mnNotificationStatus().selectedChatSent, 1);

// Outgoing messages with an explicit first-person preview marker must
// never send a notification back to their sender.
rows = [row('/t/alice', 'Alice', 'You: Sent from this Mac', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 14);
assert.equal(window.__mnNotificationStatus().selfMessageSkipped, 1);

// Focused open thread: another incoming message after an outgoing one.
rows = [row('/t/alice', 'Alice', 'Reply received 😊', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 15, 'Incoming read message after outgoing should be delivered');

// Mark as unread or visibility/focus change alone must not create a banner.
rows = [row('/t/alice', 'Alice', 'Reply received 😊', true)];
mutationCallback();
runTimers();
hidden = true;
focused = false;
mutationCallback();
runTimers();
assert.equal(received().length, 15, 'Unread toggle or focus change is not a new message');
assert.equal(window.__mnNotificationStatus().foregroundSent, 3);
assert.equal(window.__mnNotificationStatus().sent, 15);

// Real-world regression: an unsent composer draft in the selected thread
// changes the sidebar preview ("Draft: …") while focus stays on Messenger.
// This must NEVER generate a native message notification.
currentPath = '/t/alice';
hidden = false;
focused = true;
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Draft: mà mới lắp đã rỉ như', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 15, 'Typing an unsent Draft: must not notify');
assert.equal(window.__mnNotificationStatus().lastEvent, 'draft-change-suppressed');

rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Draft: mà mới lắp đã rỉ như nhé 😅', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 15, 'Editing a draft must not repeatedly notify');

// Localized UI labels are also not incoming messages.
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Bản nháp: nội dung đang gõ', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 15, 'Vietnamese draft label must not notify');

// A group draft must not be misinterpreted as a new message from "Draft".
currentPath = '/t/group';
rows = [row('/t/group', 'Project Group', 'Draft: chỉ là bản nháp', false, true)];
mutationCallback();
runTimers();
assert.equal(received().length, 15, 'Group chat drafts must not notify');

// A genuinely changed incoming preview is still delivered even if the
// selected conversation auto-marks it read after a draft is removed.
currentPath = '/t/alice';
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Tin mới đến thật sự', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 16, 'Incoming chat change after drafts must still notify');
assert.equal(received().at(-1).noiDung, 'Tin mới đến thật sự');
assert.equal(window.__mnNotificationStatus().draftSkipped, 4);
assert.equal(window.__mnNotificationStatus().sent, 16);

// Sending exactly the draft text may leave a plain sidebar preview without
// the explicit "You:" marker. Do not mistake that local send for an inbound.
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Draft: nội dung chuẩn bị gửi', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 16);
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'nội dung chuẩn bị gửi', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 16, 'Submitted local draft must not notify');
assert.equal(window.__mnNotificationStatus().lastEvent, 'draft-send-suppressed');

// Incoming messages that differ from the submitted draft must still notify.
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Người kia vừa phản hồi', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 17, 'Actual inbound after local draft send must notify');
assert.equal(received().at(-1).noiDung, 'Người kia vừa phản hồi');
assert.equal(window.__mnNotificationStatus().draftSkipped, 6);
assert.equal(window.__mnNotificationStatus().sent, 17);

// Local sends without a preceding Draft: phase are not reliably marked
// "You:" by Messenger. Capture the actual typed composer text in memory
// and suppress only a matching changed preview, not another sender's reply.
currentPath = '/t/alice';
hidden = false;
focused = true;
let composer = makeComposer('Tôi mới gửi từ máy này 😊');
emitDocument('input', { target: composer });
emitDocument('keydown', { target: composer, key: 'Enter', shiftKey: false,
  isComposing: false, metaKey: false, altKey: false, ctrlKey: false });
// Scans without a changed preview must NOT consume the local fingerprint.
mutationCallback();
runTimers();
assert.equal(received().length, 17);
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Tôi mới gửi từ máy này 😊', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 17, 'Own Enter-to-send must not notify');
assert.equal(window.__mnNotificationStatus().localSendSkipped, 1);
assert.equal(window.__mnNotificationStatus().lastEvent, 'local-send-suppressed');

// A real inbound message after a local send must be delivered immediately.
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Tin từ đối phương sau khi tôi gửi', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 18, 'Other party reply must still notify');
assert.equal(received().at(-1).noiDung, 'Tin từ đối phương sau khi tôi gửi');

// Click on the Send button must work even if the sender text isn't tagged
// and Messenger never shows an intermediate Draft: sidebar preview.
composer = makeComposer('Tôi bấm nút gửi');
emitDocument('input', { target: composer });
const sendButton = {
  getAttribute(key) { return key === 'aria-label' ? 'Send' : null; }
};
emitDocument('pointerdown', { target: {
  closest(selector) {
    return selector.includes('button') ? sendButton : null;
  }
}});
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Tôi bấm nút gửi', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 18, 'Own Send-button tap must not notify');
assert.equal(window.__mnNotificationStatus().localSendSkipped, 2);

// While typing a different message, a new inbound preview must NOT be
// suppressed simply because Messenger Native is focused and composing.
composer = makeComposer('Tôi đang soạn, chưa gửi');
emitDocument('input', { target: composer });
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Người khác gửi tin mới ngay lúc soạn', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 19, 'Real incoming during composing must notify');

// An unmatched search field input is not considered a local chat send.
const search = {
  innerText: 'Tìm kiếm trên Messenger',
  getAttribute(key) { return key === 'aria-label' ? 'Search Messenger' : null; },
  closest(selector) { return selector.includes('contenteditable') ? this : null; }
};
emitDocument('input', { target: search });
rows = [row('/t/alice', 'Ba Ông Tam Đa', 'Mới từ người khác', false)];
mutationCallback();
runTimers();
assert.equal(received().length, 20, 'Search input must not block notifications');
assert.equal(window.__mnNotificationStatus().localSendSkipped, 2);
assert.equal(window.__mnNotificationStatus().sent, 20);

// Presentation must also be enabled on macOS when the application is active.
const nativeApp = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'main.swift'), 'utf8');
assert.match(nativeApp, /xong\(\[\.banner, \.sound, \.list\]\)/,
  'macOS foreground notification delegate must present banner and sound');
assert.doesNotMatch(source, /if\s*\(!foreground\s*&&/,
  'An active app must never be an unconditional notification suppressor');
const webChimeHandler = nativeApp.slice(
  nativeApp.indexOf('if d["amBaoTinNhan"] as? Bool == true'),
  nativeApp.indexOf('guard d["id"] is String')
);
assert.doesNotMatch(webChimeHandler, /NSSound\(/,
  'Native notification sounds must not be doubled by a manual focused-app chime');

// Dock badge regression: a Chats navigation aria label that reports 2
// unread MESSAGES is not proof of 2 unread CONVERSATIONS. Count only
// actual rendered conversation rows, using the same unread detector as
// the notification engine; do not retain a stale value when rows vanish.
const navLabel = {
  getAttribute(name) { return name === 'aria-label' ? 'Chats · 2 unread messages' : null; }
};
document.querySelectorAll = selector => {
  if (selector === '[role="row"]') return rows;
  if (selector.includes('aria-label')) return [navLabel];
  return [];
};
const badgeEvents = () => messages.filter(item => item.nguonBadge);
rows = [
  row('/t/alice', 'Alice', 'Read chat preview', false),
  row('/t/bob', 'Bob', 'Unread chat preview', true),
  row('/t/bob', 'Bob', 'Same conversation duplicate DOM row', true)
];
mutationCallback();
runTimers();
assert.equal(badgeEvents().at(-1).nguonBadge, 'rendered-conversations');
assert.equal(badgeEvents().at(-1).soChuaDoc, 1,
  'Dock badge must count one unique unread conversation, not nav label 2 or two duplicated DOM rows');
assert.equal(badgeEvents().at(-1).soDongHienThi, 3);
assert.equal(window.__mnNotificationStatus().dockBadgeCount, 1);

rows = [row('/t/alice', 'Alice', 'Read chat preview', false)];
mutationCallback();
runTimers();
assert.equal(badgeEvents().at(-1).soChuaDoc, 0,
  'When the only unread chat becomes read, badge must clear');
assert.equal(window.__mnNotificationStatus().dockBadgeCount, 0);

rows = [];
mutationCallback();
runTimers();
assert.equal(badgeEvents().at(-1).nguonBadge, 'unknown',
  'No rendered chat list must clear stale Dock badge instead of inventing a global count');
assert.equal(window.__mnNotificationStatus().dockBadgeCount, null);

rows = [row('/t/carol', 'Carol', 'Unread conversation', true)];
mutationCallback();
runTimers();
assert.equal(badgeEvents().at(-1).soChuaDoc, 1, 'Badge must recover when list reappears');

// Check that no old 3-second polling loop reads the unrelated header count.
const badgeSwift = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'main.swift'), 'utf8');
assert.doesNotMatch(badgeSwift, /document\.querySelectorAll\('\[aria-label\^="Đoạn chat"/,
  'Legacy Chats navigation aria polling must be removed');
assert.match(badgeSwift, /d\["nguonBadge"\]/,
  'Native Dock badge must require source labeling from conversation rows');
assert.match(badgeSwift, /Dock badge: /, 'Notification Diagnostics must show Dock badge source');


// Regression from real 2026-11-05 capture: Messenger appends a live relative
// timestamp to an OLD preview on the SAME line, e.g. TikTok URL + "1m".
// Changing only "1m" => "2m" => ... must not produce a new alert each minute.
const countBeforeAge = received().length;
const tiktok = 'Đăng: https://vt.tiktok.com/ZSpYe68xL/';
rows = [row('/t/bnn', '🏀 Bnn', tiktok + ' 1m', true, false, '1m')];
mutationCallback();
runTimers();
assert.equal(received().length, countBeforeAge,
  'An unseen old unread chat is baseline-only');
for (const minute of [2, 3, 4, 5, 6]) {
  rows = [row('/t/bnn', '🏀 Bnn', tiktok + ' ' + minute + 'm', true, false, minute + 'm')];
  mutationCallback();
  runTimers();
}
assert.equal(received().length, countBeforeAge,
  'The old TikTok link must not generate one banner per elapsed minute');
assert.ok(window.__mnNotificationStatus().inlineTimestampsRemoved >= 6,
  'Inline timestamps from separate DOM leaf nodes must be stripped');

// Different real incoming content remains eligible, but timestamp UI never
// appears in the notification body.
const secondLink = 'Đăng: https://vt.tiktok.com/AnotherLink/';
rows = [row('/t/bnn', '🏀 Bnn', secondLink + ' 1m', true, false, '1m')];
mutationCallback();
runTimers();
assert.equal(received().length, countBeforeAge + 1,
  'Genuinely new message must still send exactly one banner');
assert.equal(received().at(-1).noiDung, secondLink,
  'Notification preview must not include a separate UI timestamp');

// Fallback for Messenger layouts whose relative time shares a single DOM
// text node (no independent age element): compare preceding signature
// and suppress only monotonic age changes, not changed message content.
rows = [row('/t/no-leaf', 'No leaf', 'Existing preview 1m', true)];
mutationCallback();
runTimers();
const countBeforeFallback = received().length;
for (const minute of [2, 3, 4, 5, 6]) {
  rows = [row('/t/no-leaf', 'No leaf', 'Existing preview ' + minute + 'm', true)];
  mutationCallback();
  runTimers();
}
assert.equal(received().length, countBeforeFallback,
  'No separate timestamp leaf: only the elapsed age changed, not the message');
assert.ok(window.__mnNotificationStatus().relativeTimeChangesBlocked >= 5,
  'Relative-age-only changes should appear in privacy-safe diagnostics');

// Genuine text ending in "5m" with no timestamp leaf must be preserved.
rows = [row('/t/no-leaf', 'No leaf', 'Meet me outside in 5m', true)];
mutationCallback();
runTimers();
assert.equal(received().length, countBeforeFallback + 1);
assert.equal(received().at(-1).noiDung, 'Meet me outside in 5m',
  'Do not automatically erase a genuine user-authored short time expression');
rows = [row('/t/no-leaf', 'No leaf', 'Actually meet me in 10m', true)];
mutationCallback();
runTimers();
assert.equal(received().length, countBeforeFallback + 2,
  'Different content, even with a time suffix, is a new preview');

// Regression from real Mac rollback feedback (Nov 8): self-authored messages
// can appear with no "You:" marker AFTER the original 12s fingerprint window.
// Explicit Send intent must survive briefly and suppress repeat row rendering.
currentPath = '/t/alice';
hidden = false;
focused = true;
const sentBeforeDelay = received().length;
composer = makeComposer('Đây là tin tôi gửi, không phải tin đến');
emitDocument('input', { target: composer });
emitDocument('keydown', { target: composer, key: 'Enter', shiftKey: false,
  isComposing: false, metaKey: false, altKey: false, ctrlKey: false });
fakeNow += 20000;
rows = [row('/t/alice', 'Alice', 'Đây là tin tôi gửi, không phải tin đến', false)];
mutationCallback();
runTimers();
assert.equal(received().length, sentBeforeDelay,
  'A genuinely sent local message must stay suppressed after the old 12-second window');
assert.equal(window.__mnIsOwnSentNotification('Đây là tin tôi gửi, không phải tin đến', '/t/alice'), true,
  'The independently emitted Web Notification must not forward the sent content to native');
assert.equal(window.__mnIsOwnSentNotification('Người khác gửi tin thật', '/t/alice'), false,
  'Web Notification for a different sender message must remain deliverable');
assert.ok(window.__mnNotificationStatus().outgoingWebSuppressed >= 1);

// A fresh inbound reply must not be suppressed by broad "window is focused"
// heuristics. Returning to the old sent preview must also remain ignored
// within the bounded send window.
rows = [row('/t/alice', 'Alice', 'Người khác gửi tin thật', false)];
mutationCallback();
runTimers();
assert.equal(received().length, sentBeforeDelay + 1,
  'Immediate real inbound reply must remain eligible');
rows = [row('/t/alice', 'Alice', 'Đây là tin tôi gửi, không phải tin đến', false)];
mutationCallback();
runTimers();
assert.equal(received().length, sentBeforeDelay + 1,
  'Messenger re-rendering an old own-send preview must not alert again');

// A different chat must not be suppressed just because this user sent a
// message elsewhere, and web notifications with no chat key may only be
// matched while the originating conversation is open and very fresh.
currentPath = '/t/bob';
assert.equal(window.__mnIsOwnSentNotification('Đây là tin tôi gửi, không phải tin đến', ''), false,
  'An unknown-thread Web Notification must not match another chat');
rows = [row('/t/bob', 'Bob', 'Đây là tin tôi gửi, không phải tin đến', true)];
mutationCallback();
runTimers();
assert.equal(received().length, sentBeforeDelay + 2,
  'Same text arriving in a different chat must still notify');
currentPath = '/t/alice';
fakeNow += 91000;
rows = [row('/t/alice', 'Alice', 'Reply after send history expires', false)];
mutationCallback();
runTimers();
const beforeExpiration = received().length;
rows = [row('/t/alice', 'Alice', 'Đây là tin tôi gửi, không phải tin đến', false)];
mutationCallback();
runTimers();
assert.equal(received().length, beforeExpiration + 1,
  'A genuinely repeated message outside the send fingerprint TTL must be deliverable');
assert.equal(window.__mnIsOwnSentNotification('Đây là tin tôi gửi, không phải tin đến', '/t/alice'), false,
  'Web send fingerprint must also expire');

// Distinguish typed-but-unsent content from explicitly submitted content:
// a draft fingerprint must not suppress an unrelated incoming message.
composer = makeComposer('Tôi còn đang soạn');
emitDocument('input', { target: composer });
rows = [row('/t/alice', 'Alice', 'Người khác gửi thêm khi tôi đang soạn', false)];
mutationCallback();
runTimers();
assert.equal(received().at(-1).noiDung, 'Người khác gửi thêm khi tôi đang soạn');

const nativeSource = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'main.swift'), 'utf8');
assert.match(nativeSource, /window\.__mnIsOwnSentNotification\(this\.body, this\.tag\)/,
  'Web Notification must call the same local-only outgoing evidence check');

// Regression (real Mac, 2026-11-08): Meta's sidebar may render a Draft
// marker with middot, en dash or as a standalone line, not merely "Draft:".
currentPath = '/t/alice';
hidden = false;
focused = true;
document.activeElement = null;
const beforeAlternateDrafts = received().length;
for (const preview of [
  'Draft · chỉ mới viết chứ chưa gửi',
  'Nháp — nội dung đang soạn',
  'Bản nháp – văn bản mới',
  'Draft\nchưa nhấn Send',
  'Nháp',
  'Bản nháp: còn đang gõ'
]) {
  rows = [row('/t/alice', 'Alice', preview, false)];
  mutationCallback();
  runTimers();
}
assert.equal(received().length, beforeAlternateDrafts,
  'Draft labels using new separators or split UI lines must never notify');
assert.ok(window.__mnNotificationStatus().draftLabelSkipped >= 6,
  'Diagnostics must count alternative draft-label suppressions without content');

// A draft whose visible preview has no Draft: marker needs *live composer*
// evidence, including beyond the old 12s fingerprint lifetime, before it
// can be suppressed. No content leaves the JS page on this check.
let textDraft = 'Tôi đang gõ nháp rất lâu nhưng chưa hề gửi';
composer = makeComposer(textDraft);
emitDocument('input', { target: composer });
fakeNow += 20000;
rows = [row('/t/alice', 'Alice', textDraft, false)];
mutationCallback();
runTimers();
assert.equal(received().length, beforeAlternateDrafts,
  'Unlabelled local draft after 20 seconds must NOT be treated as incoming');
assert.ok(window.__mnNotificationStatus().draftComposerSkipped >= 1,
  'The unsent-composer suppression must be distinguishable in Diagnostics');
assert.equal(window.__mnIsOwnSentNotification(textDraft, '/t/alice'), true,
  'A Web Notification echo containing the actual unsent draft must be blocked');
assert.equal(window.__mnIsOwnSentNotification(textDraft, ''), true,
  'Unknown-tag Web echo of the selected local draft must be blocked');
assert.equal(window.__mnIsOwnSentNotification('Một người khác nhắn tin', '/t/alice'), false,
  'Different inbound text must never be blocked by the local draft');
assert.ok(window.__mnNotificationStatus().draftWebSuppressed >= 2,
  'Web draft suppressions should be reported without draft content');

// The user edits the same draft repeatedly. The old one-shot fingerprint
// was consumed after one match; unsent drafts must remain suppressible.
for (const suffix of [' (sửa)', ' (sửa tiếp)', ' (vẫn chưa gửi)']) {
  textDraft += suffix;
  composer.innerText = textDraft;
  emitDocument('input', { target: composer });
  rows = [row('/t/alice', 'Alice', textDraft, false)];
  mutationCallback();
  runTimers();
}
assert.equal(received().length, beforeAlternateDrafts,
  'Each subsequent local-only draft change must remain silent');

// A real message with a different body in the same selected chat still
// deserves a notification even while the user is composing.
rows = [row('/t/alice', 'Alice', 'Có tin đến thật trong khi đang soạn', false)];
mutationCallback();
runTimers();
assert.equal(received().length, beforeAlternateDrafts + 1,
  'A distinct actual incoming message must still be notified');

// Same text in another thread is not evidence of a local draft there.
rows = [row('/t/bob', 'Bob', textDraft, true)];
mutationCallback();
runTimers();
assert.equal(received().length, beforeAlternateDrafts + 2,
  'Draft in chat A must not hide an incoming message in chat B');

// Clearing the editor must immediately invalidate the stale unsent draft.
currentPath = '/t/alice';
composer.innerText = '';
emitDocument('input', { target: composer });
document.activeElement = null;
rows = [row('/t/alice', 'Alice', textDraft, false)];
mutationCallback();
runTimers();
assert.equal(received().length, beforeAlternateDrafts + 3,
  'After a local draft is cleared, a real matching incoming preview is eligible');
assert.equal(window.__mnIsOwnSentNotification(textDraft, '/t/alice'), false,
  'A discarded draft must no longer suppress Web Notifications');

// A persisted draft from a previous editor session can be used briefly
// even while the user looks elsewhere, but must expire.
composer = makeComposer('Nháp cũ ở hội thoại Alice');
emitDocument('input', { target: composer });
document.activeElement = null;
fakeNow += 10 * 60 * 1000 + 1;
assert.equal(window.__mnIsOwnSentNotification('Nháp cũ ở hội thoại Alice', '/t/alice'), false,
  'Unsent composer evidence must expire and must not linger across sessions');

console.log('Notification engine: focused/background messages, own Enter/click send suppression, inbound while composing, drafts and unlabeled live composers, emoji and previews passed.');

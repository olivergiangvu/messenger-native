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

// A/B isolation regression: temporarily pause ONLY the DOM scanner.
// The separate Web Notification API and incoming-call detection are untouched.
const callTest = window.__mnNotificationEngineCallTest;
assert.equal(callTest.status().paused, false, 'normal message scanning is the default');
const pausedAt = received().length;
const scansAtPause = window.__mnNotificationStatus().scans;
assert.equal(callTest.setPaused(true).paused, true);
assert.equal(callTest.status().observerAttached, false,
  'pause disconnects the message observer instead of scanning in the background');
rows = [row('/t/no-leaf', 'No leaf', 'Message arrived while call A/B is paused', true)];
mutationCallback();
intervals[0]();
runTimers();
assert.equal(received().length, pausedAt, 'paused DOM scanner must produce no message alerts');
assert.equal(window.__mnNotificationStatus().scans, scansAtPause,
  'pausing must stop both observer scans and recovery scans');
assert.equal(callTest.status().paused, true);
assert.equal(callTest.setPaused(false).paused, false,
  'call test must be reversible without reloading the WebView');
runTimers();
assert.equal(received().length, pausedAt,
  'resuming must not replay or backfill alerts for messages received while paused');
assert.equal(window.__mnNotificationStatus().initialized, true,
  'resuming must create a fresh silent baseline');
rows = [row('/t/no-leaf', 'No leaf', 'Genuine new message after resume', true)];
mutationCallback();
runTimers();
assert.equal(received().length, pausedAt + 1,
  'a genuinely new message after re-enable must still notify');
assert.equal(callTest.status().paused, false);
assert.equal(callTest.setPaused(false).changed, false,
  'setting the existing mode cannot change its baseline');

console.log('Notification engine: focused/background messages, own Enter/click send suppression, inbound while composing, drafts, emoji and previews passed.');

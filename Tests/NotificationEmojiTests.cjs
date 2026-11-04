'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'Ma nguon', 'notification-engine.js'), 'utf8'
);
new vm.Script(source, { filename: 'notification-engine.js' });

const notifications = [];
const timers = [];
const intervals = [];
let onMutation;
let rows = [];
const root = {};

function text(value) { return { nodeType: 3, nodeValue: value }; }
function element(tagName, children, attrs = {}) {
  return {
    nodeType: 1, tagName, childNodes: children || [], hidden: false,
    getAttribute(name) { return attrs[name] ?? null; }
  };
}
function emoji(value) { return element('IMG', [], { alt: value }); }

function collect(node, match) {
  const found = [];
  for (const child of node.childNodes || []) {
    if (child.nodeType !== 1) continue;
    if (match(child)) found.push(child);
    found.push(...collect(child, match));
  }
  return found;
}
function conversation(href, title, plainPreview, previewChildren) {
  const header = element('DIV', [text(title)]);
  const preview = element('DIV', previewChildren);
  const avatar = element('IMG', [], { alt: 'Avatar of ' + title }); // must be ignored
  const anchor = element('A', [avatar, header, preview], { href });
  anchor.innerText = title + '\n' + plainPreview; // images don't appear in innerText
  anchor.querySelectorAll = selector => selector.startsWith('img[alt]')
    ? collect(anchor, n => n.tagName === 'IMG' || n.getAttribute('role') === 'img')
    : [];
  return {
    getAttribute(name) { return name === 'aria-label' ? 'unread' : null; },
    querySelector(name) { return name === 'a[href*="/t/"]' ? anchor : null; },
    querySelectorAll() { return [avatar, ...collect(preview, n => n.tagName === 'IMG')]; },
    closest() { return root; }
  };
}

const document = {
  readyState: 'complete', hidden: true,
  hasFocus() { return false; },
  querySelector(sel) { return sel === '[role="row"]' ? rows[0] || null : null; },
  querySelectorAll(sel) { return sel === '[role="row"]' ? rows : []; },
  createTreeWalker() { return { nextNode() { return null; } }; },
  addEventListener() {}
};
const window = {
  webkit: { messageHandlers: { vmThongBao: { postMessage(p) { notifications.push(p); } } },
  __vmCaiDat: { baoTinNhan: true, boTinGoi: true },
  addEventListener() {}
};
class MutationObserver {
  constructor(cb) { onMutation = cb; }
  observe() {}
  disconnect() {}
}
function drain() {
  let count = 0;
  while (timers.length) {
    if (++count > 200) throw Error('Too many timers');
    timers.shift()();
  }
}

vm.runInNewContext(source, {
  window, document, MutationObserver,
  location: { href: 'https://www.messenger.com/', pathname: '/' },
  NodeFilter: { SHOW_TEXT: 4 },
  getComputedStyle() { return { fontWeight: '400', display: 'inline', visibility: 'visible' }; },
  setTimeout(cb) { timers.push(cb); },
  setInterval(cb) { intervals.push(cb); },
  URL
});
const delivered = () => notifications.filter(p => p.nguon === 'dom');
rows = [conversation('/t/emoji', 'Alice', 'old', [text('old')])];
intervals[0](); drain();
assert.equal(delivered().length, 0, 'Baseline cannot generate a notification');

function incoming(plain, nodes, expected) {
  rows = [conversation('/t/emoji', 'Alice', plain, nodes)];
  onMutation();
  drain();
  const got = delivered().at(-1);
  assert.ok(got, 'Expected a notification');
  assert.equal(got.tieuDe, 'Alice', 'Avatar text must not be added to title');
  assert.equal(got.noiDung, expected);
  assert.equal(got.tag, '/t/emoji');
}

incoming('Hẹn nhé  tối nay', [text('Hẹn nhé '), emoji('😊'), text(' tối nay')],
         'Hẹn nhé 😊 tối nay');
incoming('', [emoji('😂')], '😂');
incoming('Về Việt Nam ', [text('Về Việt Nam '), emoji('🇻🇳')], 'Về Việt Nam 🇻🇳');
incoming('Chúc mừng ', [text('Chúc mừng '), emoji('👩🏽‍💻'), text('!')],
         'Chúc mừng 👩🏽‍💻!');
incoming('Ok  xong', [text('Ok '), emoji('👍🏽'), text(' xong')],
         'Ok 👍🏽 xong');

const roleEmoji = element('SPAN', [element('SVG', [])], { role: 'img', 'aria-label': '❤️' });
incoming('Love ', [text('Love '), roleEmoji], 'Love ❤️');

// Plain Unicode must not be changed when the page did not embed emoji images.
incoming('Hello ✨', [text('Hello ✨')], 'Hello ✨');

// A regular photograph/sticker/avatar alt must never be added to the preview.
incoming('Photo shared', [text('Photo shared'), element('IMG', [], { alt: 'photo.jpg' })],
         'Photo shared');

assert.equal(delivered().length, 8);
console.log('Notification emoji preview tests passed: inline, standalone, flag, ZWJ, skin tone, image role, Unicode, non-emoji photo');

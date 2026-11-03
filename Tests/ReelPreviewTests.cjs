'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'reel-preview.js'), 'utf8');
new vm.Script(source, { filename: 'reel-preview.js' });

class FakeElement {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.style = {};
    this.dataset = {};
    this.textContent = '';
    this.isConnected = true;
    this.parentElement = null;
    this.children = [];
    this.listeners = {};
  }
  getAttribute(key) { return this.attributes[key] || null; }
  setAttribute(key, value) { this.attributes[key] = value; }
  matches() { return false; }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener(key, cb) { this.listeners[key] = cb; }
  append(...items) { this.children.push(...items); }
  insertAdjacentElement(_position, element) {
    this.inserted = element;
    element.isConnected = true;
    element.parentElement = this.parentElement || this;
  }
  remove() { this.isConnected = false; }
}

const listeners = {};
const messages = [];
const document = {
  baseURI: 'https://www.messenger.com/',
  body: new FakeElement('body'),
  addEventListener(event, handler) { listeners[event] = handler; },
  createElement(tagName) { return new FakeElement(tagName); },
  querySelectorAll() { return []; },
};
const window = { webkit: { messageHandlers: {
  vmThongBao: { postMessage(value) { messages.push(value); } },
} } };
vm.runInNewContext(source, { window, document, Element: FakeElement, URL, Date });

const normalize = window.__mnCanonicalReel;
const first = 'https://www.facebook.com/reel/2043484703034878';
const second = 'https://www.facebook.com/reel/1989333375359780/?fs=e&rdid=u1fiTtDcKAf1cMtb&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fv%2F1BJfeHChG4%2F';
assert.equal(normalize(first), first + '/');
assert.equal(normalize(second), 'https://www.facebook.com/reel/1989333375359780/');
assert.equal(normalize('https://l.facebook.com/l.php?u=' + encodeURIComponent(first)), first + '/');
assert.equal(normalize('https://www.facebook.com/person/posts/123'), null);

function click(target) {
  let canceled = false;
  let stopped = false;
  listeners.click({
    target, button: 0, defaultPrevented: false,
    metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    preventDefault() { canceled = true; },
    stopImmediatePropagation() { stopped = true; },
  });
  return { canceled, stopped };
}

const link = new FakeElement('a', { href: first });
link.parentElement = new FakeElement('div');
assert.deepEqual(click(link), { canceled: true, stopped: true });
assert.ok(link.inserted);
assert.equal(link.inserted.dataset.mnReelPlayer, 'true');
assert.equal(window.__mnReelStatus().playerVisible, true);

const playerControls = link.inserted.children[1];
const browserButton = playerControls.children[0];
browserButton.listeners.click({ preventDefault() {}, stopPropagation() {} });
assert.equal(messages.length, 1);
assert.equal(messages[0].moNgoaiReel, first + '/');

// Native recovery reuses the last clicked Reel anchor when React calls window.open.
assert.equal(window.__mnOpenReelFromNative(first), true);

const ordinaryPost = new FakeElement('a', { href: 'https://www.facebook.com/person/posts/123' });
assert.deepEqual(click(ordinaryPost), { canceled: false, stopped: false });
console.log('Reel inline preview: URL, redirect, click, player, native fallback and browser button tests passed.');

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Ma nguon', 'reel-preview.js'), 'utf8');
new vm.Script(source, { filename: 'reel-preview.js' });

class FakeElement {
  constructor(tagName, attributes = {}, textContent = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.textContent = textContent;
    this.parentElement = null;
    this.insideEditor = false;
  }
  getAttribute(key) { return this.attributes[key] || null; }
  closest(selector) {
    if (this.insideEditor && selector.includes('contenteditable')) return this;
    return null;
  }
  matches() { return false; }
  querySelectorAll() { return []; }
}

const listeners = {};
const messages = [];
let createCount = 0;
const document = {
  baseURI: 'https://www.messenger.com/',
  addEventListener(event, handler) { listeners[event] = handler; },
  createElement() { createCount++; throw new Error('Reel iframe/player must never be created'); }
};
const window = { webkit: { messageHandlers: {
  vmThongBao: { postMessage(value) { messages.push(value); } }
} } };
vm.runInNewContext(source, { window, document, Element: FakeElement, URL, Date });

const external = window.__mnCanonicalReel;
const original = 'https://www.facebook.com/reel/2043484703034878';
const tracked = 'https://www.facebook.com/reels/1989333375359780/?fs=e&share_url=1';
const share = 'https://www.facebook.com/share/r/3xpFgh8de9/';
const shareVideo = 'https://m.facebook.com/share/v/ABC_123/';
const short = 'https://fb.watch/abcDEF_123/';
assert.equal(external(original), original + '/');
assert.equal(external(tracked), 'https://www.facebook.com/reel/1989333375359780/');
assert.equal(external('https://l.facebook.com/l.php?u=' + encodeURIComponent(original)),
  original + '/');
assert.equal(external(share), share);
assert.equal(external(shareVideo), shareVideo);
assert.equal(external(short), short);
assert.equal(external('https://www.facebook.com/watch/?v=123'), 'https://www.facebook.com/watch/?v=123');
assert.equal(external('https://www.facebook.com/person/videos/123'), 'https://www.facebook.com/person/videos/123');
assert.equal(external('https://www.facebook.com/person/posts/123'), null);
assert.equal(external('https://evil.example/reel/123'), null);
assert.equal(external('javascript:alert(1)'), null);

function click(target, extra = {}) {
  let canceled = false;
  let stopped = false;
  listeners.click({
    target, button: 0, defaultPrevented: false,
    metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra,
    preventDefault() { canceled = true; },
    stopImmediatePropagation() { stopped = true; }
  });
  return { canceled, stopped };
}

const link = new FakeElement('a', { href: original });
link.parentElement = new FakeElement('div');
assert.deepEqual(click(link), { canceled: true, stopped: true });
assert.equal(messages.length, 1);
assert.equal(messages.at(-1).moNgoaiReel, original + '/');
assert.equal(window.__mnReelStatus().playerVisible, false);
assert.equal(window.__mnReelStatus().version, '3.0-external-only');

const reelShare = new FakeElement('a', { href: share });
assert.deepEqual(click(reelShare), { canceled: true, stopped: true });
assert.equal(messages.at(-1).moNgoaiReel, share);

const videoShare = new FakeElement('a', { href: shareVideo });
assert.deepEqual(click(videoShare), { canceled: true, stopped: true });
assert.equal(messages.at(-1).moNgoaiReel, shareVideo);

const shortLink = new FakeElement('a', { href: short });
assert.deepEqual(click(shortLink), { canceled: true, stopped: true });
assert.equal(messages.at(-1).moNgoaiReel, short);

const textBubble = new FakeElement('span', {}, 'Xem Reel này nhé ' + original);
assert.deepEqual(click(textBubble), { canceled: true, stopped: true });
assert.equal(messages.at(-1).moNgoaiReel, original + '/');

// Native fallback must request the browser, not embed a video.
assert.equal(window.__mnOpenReelFromNative(original), true);
assert.equal(messages.at(-1).moNgoaiReel, original + '/');

const posts = new FakeElement('a', { href: 'https://www.facebook.com/person/posts/123' });
assert.deepEqual(click(posts), { canceled: false, stopped: false });
assert.equal(createCount, 0, 'Reel code must not insert an iframe/player or replace chat thumbnails');

// Editing a message with a Reel URL must not launch a browser.
const editor = new FakeElement('span', {}, original);
editor.insideEditor = true;
assert.deepEqual(click(editor), { canceled: false, stopped: false });

// If native bridge is unavailable, let WKWebView's native navigation policy
// handle the original URL rather than swallowing the user interaction.
const oldBridge = window.webkit.messageHandlers.vmThongBao;
window.webkit.messageHandlers.vmThongBao = null;
assert.deepEqual(click(link), { canceled: false, stopped: false });
window.webkit.messageHandlers.vmThongBao = oldBridge;

const swift = fs.readFileSync(path.join(root, 'Ma nguon', 'main.swift'), 'utf8');
assert.match(swift, /NSWorkspace\.shared\.open\(destination\)/);
assert.match(swift, /LinkRouting\.externalFacebookVideoURL\(target\)/);
assert.doesNotMatch(swift, /inline player inserted via native fallback/);
assert.doesNotMatch(source, /createElement\(['"]iframe['"]\)|plugins\/video\.php/,
  'Never create an inline Reel player');

console.log('Reel external-only tests passed: numeric, tracked, shares, watch, fb.watch, text links, editor, no embed, native handoff');

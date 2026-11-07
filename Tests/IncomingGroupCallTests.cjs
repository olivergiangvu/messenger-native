'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'incoming-group-call.js'), 'utf8');
new vm.Script(source, {filename: 'incoming-group-call.js'});
const messages = [], timeouts = [], intervals = [];
let observerCallback;
const root = {};
let rows = [];
const row = (title, text, href = '/t/group') => ({
  querySelector(selector) {
    assert.equal(selector, 'a[href*="/t/"]');
    return {
      innerText: title + '\n' + text,
      getAttribute(key) { return key === 'href' ? href : null; }
    };
  },
  closest() { return root; },
  parentElement: { parentElement: root }
});
const document = {
  readyState: 'complete',
  querySelector(selector) {
    assert.equal(selector, '[role="row"]');
    return rows[0] || null;
  },
  querySelectorAll(selector) {
    assert.equal(selector, '[role="row"]');
    return rows;
  },
  addEventListener() {}
};
const window = {
  webkit: { messageHandlers: { vmThongBao: {postMessage(p) { messages.push(p); } } } }
};
class MutationObserver {
  constructor(callback) { observerCallback = callback; }
  observe() {}
  disconnect() {}
}
const context = {
  window, document, MutationObserver,
  location: { origin: 'https://www.messenger.com', href: 'https://www.messenger.com/t/group', pathname: '/t/group' },
  URL,
  setInterval(callback) { intervals.push(callback); },
  setTimeout(callback) { timeouts.push(callback); }
};
function flush() {
  let loops = 0;
  while (timeouts.length) {
    assert.ok(++loops < 20, 'should not create endless deferred scans');
    timeouts.shift()();
  }
}
rows = [row('Ba Ông Tam Đa', 'Ma sent a photo')];
vm.runInNewContext(source, context);
flush();
assert.equal(messages.length, 0, 'initial chat rows must be silently baselined');
assert.equal(window.__mnGroupCallDetector.status().initialized, true);

rows = [row('Ba Ông Tam Đa', 'Ongoing call\nMa joined the video call')];
observerCallback();
flush();
assert.equal(messages.length, 1, 'genuine inactive->ongoing call transition');
assert.equal(messages[0].mnGroupCallStarted.path, '/t/group');
assert.equal(messages[0].mnGroupCallStarted.title, 'Ba Ông Tam Đa');
assert.equal(messages[0].mnGroupCallStarted.video, true);
intervals[0]();
assert.equal(messages.length, 1, 'repeated scans must not spam group call');

window.__mnNotificationEngineCallTest = { status: () => ({paused:true}) };
rows = [row('Ba Ông Tam Đa', 'The video call ended')];
observerCallback();
flush();
assert.equal(messages.length, 2, 'group call end must clear active session');
assert.equal(messages[1].mnGroupCallEnded, '/t/group');

rows = [row('Ba Ông Tam Đa', 'Ongoing call\nMa joined the video call')];
observerCallback();
flush();
assert.equal(messages.length, 3, 'new live group call remains detected when message scanner is paused');
assert.equal(messages[2].mnGroupCallStarted.path, '/t/group');

rows = [row('Ba Ông Tam Đa', 'Ma joined the video call')];
observerCallback();
flush();
assert.equal(messages.length, 4, 'join text without a current ongoing state must not be treated as incoming call');
assert.equal(messages[3].mnGroupCallEnded, '/t/group');

rows = [row('Ba Ông Tam Đa', 'Group video call\nTap to join')];
observerCallback();
flush();
assert.equal(messages.length, 4,
  'stale group call card without an ongoing call indicator must not trigger a false alert');

rows.push(row('New group', 'Ongoing call\nSomeone joined the video call', '/t/another'));
observerCallback();
flush();
assert.equal(messages.length, 4,
  'a previously unseen existing call cannot generate a false alert');
rows[1] = row('New group', 'The video call ended', '/t/another');
observerCallback();
flush();
rows[1] = row('New group', 'Ongoing call\nSomeone joined the video call', '/t/another');
observerCallback();
flush();
assert.equal(messages.length, 5,
  'a known conversation changing from not active to a new call must notify once');
assert.equal(messages[4].mnGroupCallStarted.path, '/t/another');

const status = window.__mnGroupCallDetector.status();
assert.equal(status.detectedTransitions, 3);
assert.equal(status.endedTransitions, 2);
assert.equal(status.observerAttached, true);
assert.ok(status.scans >= 7);
assert.doesNotMatch(source, /navigator\.sendBeacon|XMLHttpRequest|fetch\s*\(|localStorage|sessionStorage/,
  'group detector must not communicate outside the existing native bridge');
const main = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'main.swift'), 'utf8');
assert.match(main, /forResource: "incoming-group-call"/);
assert.match(main, /d\["mnGroupCallStarted"\]/);
assert.match(main, /d\["mnGroupCallEnded"\]/);
assert.match(main, /private func showOngoingGroupCallPanel/);
assert.match(main, /private func sendOngoingGroupCallBanner/);
assert.match(main, /configureAsOngoingGroupCall/);
assert.match(main, /mnConversationPath/);
console.log('Group call detector passed: silent baseline, live transitions, end, non-spam and independence from paused message scanner.');

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const swift = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'main.swift'), 'utf8');
const start = swift.indexOf('  const nhanChapNhanGoi = ');
const end = swift.indexOf('  // Tên nhóm của cuộc gọi nhóm:', start);
assert.ok(start >= 0 && end > start, 'Expected call selector helper inside embedded page JS');
const code = swift.slice(start, end).replace(/\\\\/g, '\\'); // Swift string -> JavaScript backslash
const buttons = [];
const context = { document: { querySelectorAll(selector) {
  assert.equal(selector, 'button[aria-label], [role="button"][aria-label]');
  return buttons;
} } };
vm.runInNewContext([code,
  'globalThis.find = label => nutGoiDen(label);',
  'globalThis.getContainer = element => hopGoiTuNut(element);'
].join('\n'), context);

function button(label, card, roleDialog = null) {
  return {
    getAttribute(name) { return name === 'aria-label' ? label : null; },
    closest() { return roleDialog; },
    parentElement: card
  };
}
function container(text, controls) {
  return { innerText: text, parentElement: null, querySelectorAll() { return controls; } };
}
const roleDialog = { innerText: 'Nam Hoang is calling you' };
const enAnswer = button('Answer', null, roleDialog);
const vnDecline = button('Từ chối', null, roleDialog);
buttons.push(enAnswer, vnDecline);
assert.equal(context.find('Chấp nhận'), enAnswer, 'alternate Answer label in dialog');
assert.equal(context.find('Từ chối'), vnDecline);
buttons.length = 0;

const callControls = [];
const callCard = container('Someone is calling you', callControls);
const answer = button('Answer call', callCard);
const decline = button('Decline call', callCard);
callControls.push(answer, decline);
buttons.push(answer, decline);
assert.equal(context.find('Accept'), answer, 'non-role call card with decline+live text');
assert.equal(context.find('Từ chối'), decline);
buttons.length = 0;

const notCallControls = [];
const notCallCard = container('Accept this friend request', notCallControls);
const unrelated = button('Accept', notCallCard);
const other = button('Decline', notCallCard);
notCallControls.push(unrelated, other);
buttons.push(unrelated, other);
assert.equal(context.find('Chấp nhận'), null, 'friend request must not become incoming call');
buttons.length = 0;

const partialControls = [];
const partialCard = container('Incoming audio call', partialControls);
const partial = button('Answer', partialCard);
partialControls.push(partial);
buttons.push(partial);
assert.equal(context.find('Accept'), null, 'only call text without decline control is insufficient');

assert.match(swift, /private func scheduleCallFallbackNotification\(source: String\)/);
assert.doesNotMatch(swift, /if callRinger\.sessionsStarted > sessionsBefore/,
  'notification must never depend on ringer starting a session');
assert.match(swift, /guard self\.goiDen == nil else \{ return \}/);
assert.doesNotMatch(swift, /guard self\.goiDen == nil, self\.callRinger\.isRinging/);
assert.match(swift, /sendNativeIncomingCallNotification\(source: "confirmed dialog"/);
assert.match(swift, /callAlertGate\.ringtoneSignal\(at: Date\(\)\)/);
assert.match(swift, /callRinger\.soundCandidate\(elementToken: d\["audioElementToken"\] as\? String\)/);
assert.match(swift, /cancelCallFallbackNotification\(dialogConfirmed: true\)/);
assert.match(swift, /content\.userInfo = \["mnIncomingCall": true\]/);
assert.match(swift, /"mn-incoming-call-" \+ UUID\(\)\.uuidString/);
console.log('Call alert reliability passed: alternate button labels, verified fallback call card, no friend-request false positive, audio fallback guard.');

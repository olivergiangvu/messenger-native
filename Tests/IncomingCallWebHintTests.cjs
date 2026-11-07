'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'main.swift'), 'utf8');
const begin = main.indexOf('  const laThongBaoGoiDen = ');
const end = main.indexOf('  class ThongBao {', begin);
assert.ok(begin >= 0 && end > begin, 'call classification helper exists');
const script = [main.slice(begin, end), 'globalThis.classify = laThongBaoGoiDen;'].join('\n');
const sandbox = {};
vm.runInNewContext(script, sandbox);
const isCall = sandbox.classify;
assert.equal(isCall('Incoming audio call', 'Tap to answer'), true);
assert.equal(isCall('Incoming video call from a friend', ''), true);
assert.equal(isCall('Anna is calling you', ''), true);
assert.equal(isCall('Messenger', 'Có cuộc gọi đến'), true);
assert.equal(isCall('Missed call', 'Anna is calling you'), false);
assert.equal(isCall('Messenger', 'You missed an audio call'), false);
assert.equal(isCall('Cuộc gọi nhỡ', 'Anna đang gọi'), false);
assert.equal(isCall('Messenger', 'New message from a friend'), false);
assert.match(main, /guiSwift\(\{ mnWebIncomingCallHint: true \}\)/);
assert.match(main, /if \(laThongBaoGoiDen\(this.title, this.body\)\)/);
assert.match(main, /if d\["mnWebIncomingCallHint"\] as\? Bool == true/);
// Execute the real injected Web Notification constructor to prove incoming
// calls bypass the generic message deduplicator in Swift. No message text or
// contact identity is forwarded by the call hint itself.
const classEnd = main.indexOf('  let daHoiQuyen = false;', begin);
assert.ok(classEnd > end);
const bridgeEvents = [];
const constructorContext = {
  setTimeout() {},
  Date, Math
};
const setup = [
  'const danhSach = Object.create(null);',
  'const guiSwift = payload => globalThis.bridgeEvents.push(payload);',
  main.slice(begin, classEnd),
  'globalThis.createNotification = (title, body) => new ThongBao(title, {body});'
].join('\n');
constructorContext.bridgeEvents = bridgeEvents;
vm.runInNewContext(setup, constructorContext);
constructorContext.createNotification('Incoming audio call', 'Tap to answer');
constructorContext.createNotification('Incoming audio call', 'Tap to answer');
constructorContext.createNotification('Missed audio call', 'You missed a call');
constructorContext.createNotification('New message', 'See you tonight');
assert.equal(bridgeEvents.filter(x => x.mnWebIncomingCallHint === true).length, 2,
  'each live incoming Web Notification must use the dedicated call bridge');
assert.ok(bridgeEvents.filter(x => x.mnWebIncomingCallHint).every(x => !x.id && !x.tieuDe && !x.noiDung),
  'live-call bridge cannot be filtered by the generic message notification deduplicator');
assert.equal(bridgeEvents.filter(x => x.nguon === 'web').length, 2,
  'missed call and ordinary messages still go through normal message delivery');
assert.ok(bridgeEvents.some(x => x.nguon === 'web' && x.tieuDe === 'Missed audio call'),
  'missed-call notification must not be treated as a ringing call');

console.log('Web incoming call hint regression: live calls recognized, missed/ended calls never become live ring alerts.');

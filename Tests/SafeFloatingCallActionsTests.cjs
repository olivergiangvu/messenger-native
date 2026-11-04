'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'main.swift'), 'utf8');

// Regression: synthetic clicks were the only observable difference between
// successfully answering in Messenger's webpage and doubled call-log rows
// after pressing the native floating banner.
// Keep all call acceptance/rejection in the original Messenger HTML dialog.
assert.equal(source.includes('window.__vmBamGoiDen'), false,
  'Do not reintroduce a synthetic accept/decline bridge');
assert.equal(source.includes("e.click(); return 'đã bấm '"), false,
  'Do not synthesize the Messenger call-button click');
assert.ok(source.includes('Mở để từ chối'), 'Red action must disclose that it opens the original dialog');
assert.ok(source.includes('Mở để nhận'), 'Green action must disclose that it opens the original dialog');
assert.ok(source.includes('window.makeKeyAndOrderFront(nil)'), 'Original Messenger window must become active');
assert.ok(source.includes('floatingCallHandoffs += 1'), 'Track call handoffs without logging caller identity');
assert.ok(source.includes('callRinger.stop(reason: "incoming call dialog closed")'),
  'Native ringtone still stops when the original dialog closes');
console.log('Floating call safe-action regression checks passed.');

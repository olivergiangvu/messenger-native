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
vm.runInNewContext(code + 
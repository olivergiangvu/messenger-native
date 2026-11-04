'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'Ma nguon');

function readMenu(locale) {
  const lines = fs.readFileSync(path.join(root, locale + '.lproj', 'Menu.strings'), 'utf8')
    .split(/\r?\n/).filter(line => line.startsWith('"'));
  const result = new Map();
  for (const line of lines) {
    const match = line.match(/^"((?:\\.|[^"\\])*)" = "((?:\\.|[^"\\])*)";$/);
    assert.ok(match, 'Invalid .strings entry for ' + locale + ': ' + line);
    assert.ok(!result.has(match[1]), 'Duplicate key ' + match[1] + ' in ' + locale);
    result.set(match[1], match[2]);
  }
  return result;
}

const en = readMenu('en');
const vi = readMenu('vi');
assert.ok(en.size >= 40, 'Menus unexpectedly incomplete');
assert.deepEqual([...en.keys()].sort(), [...vi.keys()].sort(), 'Missing keys in a locale');
assert.equal(en.get('Cửa sổ'), 'Window',
  'BetterTouchTool English preset expects exactly Window;Remove Window from Set');
assert.equal(vi.get('Cửa sổ'), 'Cửa sổ');
assert.equal(en.get('Xem'), 'View');
assert.equal(en.get('Sửa'), 'Edit');
assert.equal(en.get('Đoạn chat %d'), 'Chat %d');
assert.equal(vi.get('Đoạn chat %d'), 'Đoạn chat %d');

const swift = fs.readFileSync(path.join(root, 'main.swift'), 'utf8');
assert.match(swift, /NSApp\.windowsMenu = them\("Cửa sổ",/);
assert.match(swift, /let localizedTitle = MenuLocalization\.text\(tieuDe\)/);
assert.match(swift, /NSMenuItem\(title: localizedTitle, action: nil, keyEquivalent: ""\)/,
  'Menu bar item itself must have an accessible non-empty title');
assert.match(swift, /Window Menu Diagnostics…/);
assert.doesNotMatch(swift, /Remove Window from Set", #selector/,
  'Do not add a fake Stage Manager action in AppKit');

const plist = fs.readFileSync(path.join(root, 'Info.plist'), 'utf8');
assert.match(plist, /<string>en<\/string>/);
assert.match(plist, /<string>vi<\/string>/);
for (const locale of ['en', 'vi']) {
  const info = fs.readFileSync(path.join(root, locale + '.lproj', 'InfoPlist.strings'), 'utf8');
  assert.match(info, /NSMicrophoneUsageDescription/);
  assert.match(info, /NSCameraUsageDescription/);
}
console.log('Native menu localization passed: ' + en.size + ' English/Vietnamese keys; Window accessibility naming verified.');

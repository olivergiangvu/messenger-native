'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'Ma nguon');
const readTable = (locale) => {
  const text = fs.readFileSync(path.join(root, locale + '.lproj', 'Interface.strings'), 'utf8');
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('"')) continue;
    const pair = line.match(/^"((?:\\.|[^"\\])*)" = "((?:\\.|[^"\\])*)";$/);
    assert.ok(pair, 'Invalid .strings line: ' + line);
    assert.ok(!map.has(pair[1]), 'Duplicate localized key: ' + pair[1]);
    map.set(pair[1], pair[2]);
  }
  return map;
};
const en = readTable('en'), vi = readTable('vi');
assert.ok(en.size >= 90, 'Incomplete native Settings strings table');
assert.deepEqual([...en.keys()].sort(), [...vi.keys()].sort(), 'English/Vietnamese UI keys differ');
for (const [key, val] of en) {
  assert.ok(val.trim().length, 'Missing English translation of ' + key);
  const formatCount = (s) => [...s.matchAll(/%[@df]/g)].length;
  assert.equal(formatCount(key), formatCount(val), 'Mismatched format specifiers: ' + key);
}

assert.equal(en.get('Thông báo'), 'Notifications');
assert.equal(en.get('Cuộc gọi'), 'Calls');
assert.equal(en.get('Tải file'), 'Downloads');
assert.equal(en.get('Chung'), 'General');
assert.equal(en.get('Thông báo tin nhắn mới'), 'New message notifications');
assert.ok(en.get('Thông báo khi có tin nhắn mới dù cửa sổ đang được chọn, hiện trên màn hình, chạy nền hoặc thu nhỏ. Dùng quan sát thay đổi và quét dự phòng 3,5 giây. Chỉ hoạt động khi app còn chạy; có thể bỏ sót nếu WebKit bị đình chỉ. Chế độ Tập trung và thiết lập Thông báo của macOS vẫn được áp dụng.')
  .includes('focused, visible, backgrounded or minimized'));

const swift = fs.readFileSync(path.join(root, 'main.swift'), 'utf8');
const permissions = fs.readFileSync(path.join(root, 'CallMediaPermissions.swift'), 'utf8');
const localizer = fs.readFileSync(path.join(root, 'MenuLocalization.swift'), 'utf8');
assert.match(localizer, /Bundle\.main\.localizedString\(forKey: key, value: key, table: "Interface"\)/,
  'Settings must use real macOS bundle localization, not UI-specific language preferences');
assert.match(localizer, /String\(format: ui\(key\), locale: Locale\.current, arguments: arguments\)/);
assert.match(swift, /"Thông báo", "Cuộc gọi", "Tải file", "Chung"\]\.map\(MenuLocalization\.ui\)/);
assert.match(swift, /MenuLocalization\.uiFormat\("Cài đặt %@", tenApp\)/);
assert.match(swift, /congTac\("baoTinNhan", true, "Thông báo tin nhắn mới"\)/);
assert.doesNotMatch(swift, /App tự xem danh sách chat 2 giây\/lần/);
assert.match(permissions, /MenuLocalization\.ui\("Đã cho phép"\)/);

const literals = new Set();
for (const regex of [
  /chuGhi\("([^"\n]+)"\)/g,
  /tieuDeMuc\("([^"\n]+)",/g,
  /congTac\("[^"]+",\s*(?:true|false),\s*"([^"\n]+)"/g,
  /nut\("([^"\n]+)"/g
]) {
  for (const match of swift.matchAll(regex)) {
    // Ignore custom source strings containing interpolation: the key must be
    // supplied through MenuLocalization.uiFormat(...), not ui().
    if (!match[1].includes('\\(')) literals.add(match[1]);
  }
}
for (const key of literals) {
  // Menu and main app labels can also originate in the menu strings table;
  // menu-only strings are not part of the Settings UI.
  if (key === 'Không tải được') continue;
  assert.ok(en.has(key), 'No English Settings translation for: ' + key);
}
console.log('System-language Settings passed: ' + en.size +
  ' English/Vietnamese pairs, ' + literals.size + ' Settings labels verified.');

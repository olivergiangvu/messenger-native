'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'main.swift'),'utf8');
const first=src.indexOf('let rawWebCallTest = ProcessInfo.processInfo.environment["MN_RAW_WEB_CALL_TEST"] == "1"');
const control=src.indexOf('if rawWebCallTest {',first);
const elseIdx=src.indexOf('} else {',control);
const end=src.indexOf('cauHinh.userContentController.add(self, name: "vmThongBao")',elseIdx);
assert.ok(first>=0 && control>first && elseIdx>control && end>elseIdx,
 'raw mode is defined and all page scripts are guarded');
const body=src.slice(elseIdx,end);
const expected=[
 'source: jsCaiDat()','source: jsThongBao','forResource: "incoming-call-audio"',
 'forResource: "incoming-call-frame-probe"',
 'forResource: "incoming-group-call"',
 'forResource: "notification-engine"',
 'forResource: "notification-navigation"',
 'forResource: "reel-preview"'
];
for (const item of expected) assert.ok(body.includes(item), 'must bypass '+item);
assert.ok(!src.slice(control,elseIdx).includes('addUserScript('), 'raw branch must inject nothing');
assert.match(src, /Raw WebKit call test mode:/);
assert.match(src, /cauHinh\.websiteDataStore = \.default\(\)/);
assert.match(src, /webView\.customUserAgent = userAgentSafari/);
assert.match(src, /webView\.load\(URLRequest\(url: trangChu\)\)/);
assert.match(src, /cauHinh\.userContentController\.add\(self, name: "vmThongBao"\)/);
console.log('Raw web call A/B test passed: same website, UA, cookies and native WebKit; no custom injected JS.');

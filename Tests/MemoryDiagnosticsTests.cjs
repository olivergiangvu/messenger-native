'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'Ma nguon');
const source = fs.readFileSync(path.join(root, 'memory-diagnostics.js'), 'utf8');
new vm.Script(source, { filename: 'memory-diagnostics.js' });

let scans = 0;
const img = [
  { complete: true, naturalWidth: 1024, naturalHeight: 1024 },
  { complete: true, naturalWidth: 256, naturalHeight: 256 },
  { complete: false, naturalWidth: 0, naturalHeight: 0 }
];
const dom = {
  '*': Array(30).fill(null),
  img,
  video: [
    { paused: false, ended: false },
    { paused: true, ended: false }
  ],
  iframe: [null],
  canvas: [null, null],
  svg: Array(4).fill(null)
};
const context = {
  window: {},
  document: {
    getElementsByTagName(tag) {
      scans++;
      return dom[tag] || [];
    }
  },
  performance: {
    getEntriesByType(type) { assert.equal(type, 'resource'); return Array(7).fill(null); }
  },
  // No mutation/network or scheduling APIs, so any attempt to invoke those throws.
};
vm.runInNewContext(source, context);
assert.equal(typeof context.window.__mnRendererStatus, 'function');
assert.equal(scans, 0, 'Installing helper must perform NO scans');
const report = context.window.__mnRendererStatus();
assert.equal(report.version, '1.0-on-demand');
assert.equal(report.elementCount, 30);
assert.equal(report.images, 3);
assert.equal(report.loadedImages, 2);
assert.equal(report.sampledImages, 3);
assert.equal(report.decodedPixelProxyMB, 4);
assert.equal(report.playingVideos, 1);
assert.equal(report.videos, 2);
assert.equal(report.iframes, 1);
assert.equal(report.canvas, 2);
assert.equal(report.svg, 4);
assert.equal(report.resourceTimingEntries, 7);
assert.equal(report.jsHeapMBIfSupported, null,
  'Safari without Chromium performance.memory must report unavailable');
assert.deepEqual(Object.keys(report).sort(), [
  'canvas', 'decodedPixelProxyMB', 'elementCount', 'iframes', 'images',
  'jsHeapMBIfSupported', 'loadedImages', 'playingVideos', 'resourceTimingEntries',
  'sampledImages', 'svg', 'version', 'videos', 'warning'
].sort());
vm.runInNewContext(source, context);
assert.equal(scans > 0, true);
assert.equal(typeof context.window.__mnRendererStatus, 'function');
assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|navigator\.sendBeacon/);

const main = fs.readFileSync(path.join(root, 'main.swift'), 'utf8');
assert.match(main, /func chanDoanBoNho\(\)/);
assert.match(main, /window\.__mnRendererStatus/);
assert.match(main, /forResource: "memory-diagnostics"/);
assert.match(main, /#selector\(chanDoanBoNho\)/);
console.log('Renderer diagnostics tests passed: privacy-safe, on-demand, no persistent scans, no Chromium heap assumption.');

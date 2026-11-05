'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const swift = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'main.swift'), 'utf8');
const start = swift.indexOf('  let henQuetPhucHoi = null');
const end = swift.indexOf('  window.__mnCallDetectionStatus', start);
assert.ok(start >= 0 && end > start, 'adaptive scheduler must exist in embedded JS');
const scheduler = swift.slice(start, end);
assert.match(swift, /observerCuocGoi = new MutationObserver/);
assert.match(swift, /soQuetTuObserver\+\+;\s*quetHopGoi\(\);[\s\S]{0,180}?lapQuetPhucHoi\(\)/,
  'event-driven calls must adapt recovery cadence');
assert.match(swift, /\}, 70\);/, 'fast observer debounce must remain 70 ms');
assert.match(swift, /if \(window\.__vmNhip\) \{\s*setTimeout\(\(\) => \{ ghiTon\(\)/,
  'timing logs should run only in debug');
assert.match(swift, /if \(!window\.__vmNhip\) return f\(\)/,
  'ordinary calls should not accumulate timing samples');

const timers = new Map();
let nextID = 0;
const context = {
  setTimeout(fn, ms) {
    const id = ++nextID;
    timers.set(id, { fn, ms });
    return id;
  },
  clearTimeout(id) { timers.delete(id); }
};
const script = [
  "let observerCuocGoi = {}; let hopCu = ''; let observedScans = 0;",
  'function quetHopGoi() { observedScans++; }',
  'function batQuanSatCuocGoi() { observerCuocGoi = {}; }',
  scheduler,
  'globalThis.status = () => ({ polls: soQuetPhucHoi, delay: trePhucHoiMs, observedScans });',
  "globalThis.callActive = yes => { hopCu = yes ? 'dialog' : ''; lapQuetPhucHoi(); };",
  'globalThis.observerAvailable = yes => { observerCuocGoi = yes ? {} : null; lapQuetPhucHoi(); };'
].join('\n');
vm.runInNewContext(script, context);

function nextDelay() {
  assert.equal(timers.size, 1, 'must have exactly one recovery timer');
  return [...timers.values()][0].ms;
}
function advance() {
  const [id, job] = [...timers.entries()][0];
  timers.delete(id);
  job.fn();
}
assert.equal(nextDelay(), 1400, 'idle: half previous full scans');
advance();
assert.equal(context.status().polls, 1);
assert.equal(context.status().observedScans, 1);
assert.equal(nextDelay(), 1400);
context.callActive(true);
assert.equal(nextDelay(), 700, 'incoming call: keep original heartbeat');
advance();
assert.equal(nextDelay(), 700);
context.callActive(false);
assert.equal(nextDelay(), 1400);
context.observerAvailable(false);
assert.equal(nextDelay(), 700, 'missing observer: keep original fallback');
advance();
assert.equal(nextDelay(), 1400, 'rebind observer: return to idle cadence');
console.log('Call recovery tests passed: 1400 ms idle, 700 ms active/missing observer, single timer.');
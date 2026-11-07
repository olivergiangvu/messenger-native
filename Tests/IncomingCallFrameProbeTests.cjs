'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'incoming-call-frame-probe.js'), 'utf8');
const swift = fs.readFileSync(path.join(__dirname, '..', 'Ma nguon', 'main.swift'), 'utf8');
new vm.Script(source, {filename:'incoming-call-frame-probe.js'});
const events=[], intervals=[], tasks=[];
const buttons = labels => labels.map(label=>({getAttribute:key=>key==='aria-label'?label:null}));
const dialog = (text,labels)=>({
 innerText:text,
 querySelectorAll(sel) {assert.equal(sel,'[aria-label]'); return buttons(labels);}
});
let dialogs=[], observeCallback;
const document={
 readyState:'complete', documentElement:{},
 querySelectorAll(sel) {assert.equal(sel,'[role="dialog"],[role="alertdialog"]'); return dialogs;},
 addEventListener(){}
};
class MutationObserver {
 constructor(cb) {observeCallback=cb;}
 observe(){}
 disconnect(){}
}
let now=1700000000000;
function create(frame) {
 const window={webkit:{messageHandlers:{vmThongBao:{postMessage(x){events.push(x);}}}}};
 window.top=frame?{}:window;
 vm.runInNewContext(source,{window,document,MutationObserver,Date:{now:()=>now},
  setTimeout(fn){tasks.push(fn);},setInterval(fn){intervals.push(fn);}});
 return window;
}
create(false);
assert.equal(events.length,0,'main frame must not register a duplicate call detector');
assert.equal(intervals.length,0);
const frame=create(true);
assert.equal(frame.__mnIframeCallProbeInstalled,true);
assert.equal(events.length,1);
assert.equal(events[0].mnIframeCallProbe.kind,'frameReady');
function runPending(){while(tasks.length)tasks.shift()();}
runPending();
const count=()=>events.filter(x=>x.mnIframeCallProbe.kind==='confirmedDialog').length;
dialogs=[dialog('Accept invitation to become friends',['Accept','Decline'])];
observeCallback();runPending();
assert.equal(count(),0,'a friend request must NOT cause an incoming call banner');
dialogs=[dialog('Linh is calling you',['Answer','Decline'])];
observeCallback();runPending();
assert.equal(count(),1,'paired live call controls in a frame must trigger exactly one event');
assert.deepEqual(Object.keys(events.at(-1).mnIframeCallProbe).sort(),['kind','present'],
  'do not forward any caller text or identity from an iframe');
intervals[0]();intervals[0]();
assert.equal(count(),1,'same dialog may not trigger duplicate banners');
dialogs=[];
observeCallback();runPending();
assert.equal(events.at(-1).mnIframeCallProbe.kind,'dialogEnded');
now+=61000;
dialogs=[dialog('Có người đang gọi cho bạn',['Chấp nhận','Từ chối'])];
observeCallback();runPending();
assert.equal(count(),2,'a second incoming call can be recognized');
assert.match(swift,/forResource: "incoming-call-frame-probe"/);
assert.match(swift,/forMainFrameOnly: false/);
assert.match(swift,/message\.frameInfo\.isMainFrame/);
assert.match(swift,/message\.frameInfo\.securityOrigin\.host/);
assert.match(swift,/callIframeVerifiedDialogs/);
assert.match(swift,/showVerifiedIframeCallPanel/);
assert.match(swift,/openTitle: "Mở Messenger"/);
assert.doesNotMatch(source,/\.click\(|XMLHttpRequest|fetch\s*\(|localStorage|document\.cookie/,
 'frame probe is observational and cannot act on calls or personal data');
console.log('Embedded call iframe probe passed: frame-only, verified pairs, no friend false-positive, 1/event, cleanup and private payload.');

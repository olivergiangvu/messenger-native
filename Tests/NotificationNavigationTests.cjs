'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(
  path.join(__dirname, '..', 'Ma nguon', 'notification-navigation.js'), 'utf8'
);

function setup(start = '/t/old') {
  const queued = [];
  const links = [];
  let hardNavigations = 0;
  let reloads = 0;
  let pathname = start;
  const location = {
    origin: 'https://www.messenger.com',
    get pathname() { return pathname; },
    set pathname(next) { pathname = next; },
    get href() { return this.origin + this.pathname; },
    set href(_) { hardNavigations++; throw Error('Hard navigation prohibited'); },
    reload() { reloads++; throw Error('Reload prohibited'); }
  };
  const document = { querySelectorAll() { return links; } };
  const window = {};
  const context = { window, document, location, URL,
    setTimeout(fn) { queued.push(fn); }
  };
  vm.runInNewContext(script, context);
  const addLink = (path, navigate = true) => {
    let clicks = 0;
    const a = {
      href: location.origin + path,
      getAttribute(n) { return n === 'href' ? path : null; },
      click() { clicks++; if (navigate) location.pathname = path; },
      get clicks() { return clicks; }
    };
    links.push(a);
    return a;
  };
  const drain = (limit = 100) => {
    let n = 0;
    while (queued.length) {
      if (++n > limit) throw Error('Infinite retry loop');
      queued.shift()();
    }
  };
  return {
    nav: window.__mnNotificationNavigation,
    addLink, drain, location,
    get hardNavigations() { return hardNavigations; },
    get reloads() { return reloads; }
  };
}

{
  const h = setup();
  const link = h.addLink('/t/target');
  assert.equal(h.nav.open('/t/target'), 'anchor-clicked');
  h.drain();
  assert.equal(h.location.pathname, '/t/target');
  assert.equal(link.clicks, 1, 'route should not be clicked repeatedly after success');
  assert.equal(h.nav.status().status, 'route-matched');
  assert.equal(h.hardNavigations, 0);
  assert.equal(h.reloads, 0);
}

{
  const h = setup('/t/already-open');
  const link = h.addLink('/t/already-open');
  assert.equal(h.nav.open('/t/already-open'), 'route-matched');
  h.drain();
  assert.equal(link.clicks, 0, 'same-chat notification must not reload or re-open route');
  assert.equal(h.reloads, 0);
}

{
  const h = setup();
  assert.equal(h.nav.open('/t/arriving'), 'waiting-for-conversation-row');
  const link = h.addLink('/t/arriving');
  h.drain();
  assert.equal(link.clicks, 1, 'wait for React to render conversation anchor');
  assert.equal(h.nav.status().status, 'route-matched');
}

{
  const h = setup();
  h.nav.open('/t/not-rendered');
  h.drain();
  assert.equal(h.nav.status().status, 'not-opened');
  assert.equal(h.location.pathname, '/t/old');
  assert.equal(h.hardNavigations, 0, 'missing anchor must not force a full navigation');
}

{
  const h = setup();
  assert.equal(h.nav.open('https://malicious.example/t/1'), 'invalid');
  assert.equal(h.nav.open('/t/1?redirect=evil'), 'invalid');
  assert.equal(h.nav.open('/t/'), 'invalid');
  assert.equal(h.nav.open('/settings'), 'invalid');
  assert.equal(h.hardNavigations, 0);
}

{
  const h = setup();
  h.nav.open('/t/no-longer-needed');
  const target = h.addLink('/t/newest');
  h.nav.open('/t/newest');
  h.drain();
  assert.equal(target.clicks, 1, 'newer notification cancels older retries');
  assert.equal(h.nav.status().status, 'route-matched');
}

console.log('Notification navigation SPA tests passed');

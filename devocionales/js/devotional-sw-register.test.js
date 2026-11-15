const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const filename = path.join(__dirname, 'devotional-sw-register.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalSwRegister;
}

const { register, reloadOnUpdate, start, disable } = loadModule();

function fakeNavigator({ controller = null, registerImpl } = {}) {
    const listeners = {};
    const calls = [];
    return {
        calls,
        listeners,
        serviceWorker: {
            controller,
            addEventListener: (type, handler) => { listeners[type] = handler; },
            register: registerImpl || ((...args) => { calls.push(args); return Promise.resolve({ scope: args[1].scope }); }),
        },
    };
}

// Lets chained promises and timers run: registration now follows an asynchronous marker cleanup.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeDocument(state) {
    const listeners = {};
    return {
        visibilityState: state,
        addEventListener: (type, handler) => { listeners[type] = handler; },
        removeEventListener: (type) => { delete listeners[type]; },
        listeners,
        hide() {
            this.visibilityState = 'hidden';
            if (listeners.visibilitychange) listeners.visibilitychange();
        },
    };
}

test('register: does nothing, without throwing, when service workers are unsupported', async () => {
    assert.equal(await register({}, '/devocionales/sw.js', '/devocionales/'), null);
    assert.equal(await register(undefined, '/devocionales/sw.js', '/devocionales/'), null);
});

test('register: asks for the worker with its scope and bypasses the HTTP cache for updates', async () => {
    const nav = fakeNavigator();
    await register(nav, '/devocionales/sw.js', '/devocionales/');
    assert.deepEqual(nav.calls, [['/devocionales/sw.js', { scope: '/devocionales/', updateViaCache: 'none' }]]);
});

test('register: a failed registration resolves to null instead of throwing', async () => {
    const nav = fakeNavigator({ registerImpl: () => Promise.reject(new Error('blocked')) });
    assert.equal(await register(nav, '/devocionales/sw.js', '/devocionales/'), null);
});

test('register: a synchronous throw from register is also contained', async () => {
    const nav = fakeNavigator({ registerImpl: () => { throw new Error('sync'); } });
    assert.equal(await register(nav, '/devocionales/sw.js', '/devocionales/'), null);
});

test('reloadOnUpdate: the worker claiming a page that started without one is not an update', () => {
    const nav = fakeNavigator({ controller: null });
    const doc = fakeDocument('hidden');
    let reloads = 0;
    reloadOnUpdate(nav, doc, () => { reloads += 1; });
    nav.listeners.controllerchange();
    assert.equal(reloads, 0);
});

test('reloadOnUpdate: a deploy never reloads under the reader\'s eyes, only once the tab is hidden', () => {
    const nav = fakeNavigator({ controller: {} });
    const doc = fakeDocument('visible');
    let reloads = 0;
    reloadOnUpdate(nav, doc, () => { reloads += 1; });
    nav.listeners.controllerchange();
    assert.equal(reloads, 0);
    doc.hide();
    assert.equal(reloads, 1);
});

test('reloadOnUpdate: an update while the tab is already hidden reloads at once, and only once', () => {
    const nav = fakeNavigator({ controller: {} });
    const doc = fakeDocument('hidden');
    let reloads = 0;
    reloadOnUpdate(nav, doc, () => { reloads += 1; });
    nav.listeners.controllerchange();
    nav.listeners.controllerchange();
    assert.equal(reloads, 1);
});

test('reloadOnUpdate: the first claim is skipped but the next worker change is an update', () => {
    const nav = fakeNavigator({ controller: null });
    const doc = fakeDocument('hidden');
    let reloads = 0;
    reloadOnUpdate(nav, doc, () => { reloads += 1; });
    nav.listeners.controllerchange();
    nav.listeners.controllerchange();
    assert.equal(reloads, 1);
});

test('reloadOnUpdate: without service worker support it does nothing', () => {
    assert.doesNotThrow(() => reloadOnUpdate({}, fakeDocument('visible'), () => {}));
    assert.doesNotThrow(() => reloadOnUpdate(undefined, fakeDocument('visible'), () => {}));
});

test('start: registers at once when the page has already loaded', async () => {
    const nav = fakeNavigator();
    const win = { navigator: nav, document: fakeDocument('visible'), location: { reload() {} }, addEventListener() {} };
    win.document.readyState = 'complete';
    start(win, '/devocionales/sw.js', '/devocionales/');
    await settle();
    assert.equal(nav.calls.length, 1);
});

test('start: waits for the load event so the worker never competes with first paint', async () => {
    const nav = fakeNavigator();
    const handlers = {};
    const win = { navigator: nav, document: fakeDocument('visible'), location: { reload() {} }, addEventListener: (type, handler) => { handlers[type] = handler; } };
    win.document.readyState = 'loading';
    start(win, '/devocionales/sw.js', '/devocionales/');
    assert.equal(nav.calls.length, 0);
    handlers.load();
    await settle();
    assert.equal(nav.calls.length, 1);
});

// ------------------------------------------------------------------ master switch (kill switch)

function disableWindow({ registrations = [], cacheNames = [], manifest = { removed: false, remove() { this.removed = true; } } } = {}) {
    const unregistered = [];
    const deleted = [];
    const events = [];
    return {
        unregistered,
        deleted,
        events,
        manifest,
        navigator: {
            serviceWorker: {
                getRegistrations: async () => registrations.map((scope) => ({
                    scope,
                    unregister: async () => { unregistered.push(scope); events.push(`unregister ${scope}`); return true; },
                })),
            },
        },
        caches: {
            open: async (name) => { events.push(`open ${name}`); return {}; },
            keys: async () => cacheNames,
            delete: async (name) => { deleted.push(name); events.push(`delete ${name}`); return true; },
        },
        document: { querySelector: (selector) => (selector === 'link[rel="manifest"]' ? manifest : null) },
    };
}

test('disable: removes this app\'s worker and caches and the manifest link, and nothing else', async () => {
    const win = disableWindow({
        registrations: ['https://x.test/devocionales/', 'https://x.test/devocionales/sub/', 'https://x.test/habitus/', 'https://x.test/'],
        cacheNames: ['devocionales-abc123', 'devocionales-data', 'devocionales-disabled', 'other-app', 'workbox-precache'],
    });
    await disable(win, '/devocionales/');
    assert.deepEqual(win.unregistered, ['https://x.test/devocionales/']); // exactly this scope, not deeper ones
    assert.deepEqual(win.deleted.sort(), ['devocionales-abc123', 'devocionales-data']); // not the marker
    assert.equal(win.manifest.removed, true);
});

test('disable: leaves the stand-down marker first, so a still-running worker stops saving before anything is deleted', async () => {
    const win = disableWindow({
        registrations: ['https://x.test/devocionales/'],
        cacheNames: ['devocionales-abc123', 'devocionales-data'],
    });
    await disable(win, '/devocionales/');
    assert.equal(win.events[0], 'open devocionales-disabled');
    assert.ok(win.events.indexOf('open devocionales-disabled') < win.events.findIndex((e) => e.startsWith('delete ')));
});

test('disable: with nothing installed it does nothing and does not throw', async () => {
    const win = disableWindow({ manifest: null });
    await assert.doesNotReject(disable(win, '/devocionales/'));
    assert.deepEqual(win.unregistered, []);
    assert.deepEqual(win.deleted, []);
});

test('disable: browsers without service workers or the Cache API are fine', async () => {
    await assert.doesNotReject(disable({ navigator: {}, document: { querySelector: () => null } }, '/devocionales/'));
    await assert.doesNotReject(disable({ navigator: undefined, document: { querySelector: () => null } }, '/devocionales/'));
});

test('disable: a failing unregister or cache delete never throws', async () => {
    const win = disableWindow({ registrations: ['https://x.test/devocionales/'], cacheNames: ['devocionales-data'] });
    win.navigator.serviceWorker.getRegistrations = async () => { throw new Error('denied'); };
    win.caches.delete = async () => { throw new Error('denied'); };
    await assert.doesNotReject(disable(win, '/devocionales/'));
});

test('start: with the PWA disabled it registers nothing, watches nothing, and removes what is installed', async () => {
    const nav = fakeNavigator();
    const win = disableWindow({ registrations: ['https://x.test/devocionales/'], cacheNames: ['devocionales-data'] });
    win.navigator = { ...nav };
    win.document.readyState = 'complete';
    win.location = { reload() {} };
    win.addEventListener = () => {};
    start(win, '/devocionales/sw.js', '/devocionales/', { enabled: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(nav.calls.length, 0);
    assert.deepEqual(Object.keys(nav.listeners), []);
    assert.equal(win.manifest.removed, true);
});

test('start: enabled, or no config at all, still registers', async () => {
    for (const config of [undefined, {}, { enabled: true }]) {
        const nav = fakeNavigator();
        const win = { navigator: nav, document: fakeDocument('visible'), location: { reload() {} }, addEventListener() {} };
        win.document.readyState = 'complete';
        start(win, '/devocionales/sw.js', '/devocionales/', config);
        await settle();
        assert.equal(nav.calls.length, 1, JSON.stringify(config));
    }
});

test('start: enabling removes a stale stand-down marker first, then registers', async () => {
    const order = [];
    const nav = fakeNavigator({ registerImpl: () => { order.push('register'); return Promise.resolve({}); } });
    const win = {
        navigator: nav,
        document: fakeDocument('visible'),
        location: { reload() {} },
        addEventListener() {},
        caches: { delete: async (name) => { order.push(`delete ${name}`); return true; } },
    };
    win.document.readyState = 'complete';
    start(win, '/devocionales/sw.js', '/devocionales/', { enabled: true });
    await settle();
    assert.deepEqual(order, ['delete devocionales-disabled', 'register']);
});

test('start: a failing marker delete never stops registration', async () => {
    const nav = fakeNavigator();
    const win = {
        navigator: nav,
        document: fakeDocument('visible'),
        location: { reload() {} },
        addEventListener() {},
        caches: { delete: async () => { throw new Error('denied'); } },
    };
    win.document.readyState = 'complete';
    start(win, '/devocionales/sw.js', '/devocionales/', {});
    await settle();
    assert.equal(nav.calls.length, 1);
});

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

const { register, reloadOnUpdate, deliverUpdates, answerBuildQueries, start, disable, createEntryWindow } = loadModule();

function fakeNavigator({ controller = null, registerImpl } = {}) {
    const listeners = {};
    const calls = [];
    return {
        calls,
        listeners,
        serviceWorker: {
            controller,
            addEventListener: (type, handler) => { listeners[type] = handler; },
            register: registerImpl || ((...args) => { calls.push(args); return Promise.resolve(fakeRegistration()); }),
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

test('disable: a visitor who never had a worker or a build cache gets no marker and no sweep, but the manifest link still goes', async () => {
    for (const cacheNames of [[], ['other-app'], ['devocionales-disabled']]) { // a leftover marker is not an installed app
        const win = disableWindow({ registrations: ['https://x.test/habitus/'], cacheNames });
        await disable(win, '/devocionales/');
        assert.deepEqual(win.events, [], JSON.stringify(cacheNames));
        assert.equal(win.manifest.removed, true);
    }
});

test('disable: a registration alone, or a cache alone, is enough to run the sweep', async () => {
    const registrationOnly = disableWindow({ registrations: ['https://x.test/devocionales/'] });
    await disable(registrationOnly, '/devocionales/');
    assert.deepEqual(registrationOnly.unregistered, ['https://x.test/devocionales/']);
    assert.ok(registrationOnly.events.includes('open devocionales-disabled'));

    const cacheOnly = disableWindow({ cacheNames: ['devocionales-abc123'] });
    await disable(cacheOnly, '/devocionales/');
    assert.deepEqual(cacheOnly.deleted, ['devocionales-abc123']);
    assert.ok(cacheOnly.events.includes('open devocionales-disabled'));
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
    const nav = fakeNavigator({ registerImpl: () => { order.push('register'); return Promise.resolve(fakeRegistration()); } });
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


test('start: enabling deletes the marker once; a delete that fails is not retried and does not stop registration', async () => {
    let attempts = 0;
    const nav = fakeNavigator();
    const win = {
        navigator: nav,
        document: fakeDocument('visible'),
        location: { reload() {} },
        addEventListener() {},
        caches: { delete: async () => { attempts += 1; throw new Error('denied'); } },
    };
    win.document.readyState = 'complete';
    start(win, '/devocionales/sw.js', '/devocionales/', {});
    await settle();
    assert.equal(attempts, 1);
    assert.equal(nav.calls.length, 1);
});

// ------------------------------------------------------------------ build question and updates

function fakeRegistration({ waiting = null, installing = null } = {}) {
    const listeners = {};
    return {
        waiting,
        installing,
        listeners,
        addEventListener: (type, handler) => { listeners[type] = handler; },
    };
}
const fakeWorker = () => {
    const posted = [];
    const listeners = {};
    return { posted, listeners, state: 'installing', postMessage: (message) => posted.push(message), addEventListener: (type, handler) => { listeners[type] = handler; } };
};

test('answerBuildQueries: the page tells the worker which build it runs, over the port it was given', () => {
    const nav = fakeNavigator();
    let started = 0;
    nav.serviceWorker.startMessages = () => { started += 1; };
    answerBuildQueries(nav, { DevotionalBuild: { id: 'abc123def456' } });
    const replies = [];
    nav.listeners.message({ data: { type: 'devocionales-build?' }, ports: [{ postMessage: (id) => replies.push(id) }] });
    assert.deepEqual(replies, ['abc123def456']);
    assert.equal(started, 1);
});

test('answerBuildQueries: a page without a build stamp, or any other message, gets no answer', () => {
    const replies = [];
    const port = { postMessage: (id) => replies.push(id) };
    const bare = fakeNavigator();
    answerBuildQueries(bare, {});
    bare.listeners.message({ data: { type: 'devocionales-build?' }, ports: [port] });
    const stamped = fakeNavigator();
    answerBuildQueries(stamped, { DevotionalBuild: { id: 'x' } });
    for (const event of [{ data: { type: 'other' }, ports: [port] }, { data: null, ports: [port] }, { data: { type: 'devocionales-build?' }, ports: [] }]) stamped.listeners.message(event);
    assert.deepEqual(replies, []);
    assert.doesNotThrow(() => answerBuildQueries({}, {}));
});

test('deliverUpdates: a waiting worker is asked to take over only while the tab is hidden', () => {
    const waiting = fakeWorker();
    const nav = fakeNavigator({ controller: {} });
    const doc = fakeDocument('visible');
    deliverUpdates(nav, doc, fakeRegistration({ waiting }));
    assert.deepEqual(waiting.posted, []);
    doc.hide();
    assert.deepEqual(waiting.posted, [{ type: 'devocionales-skip-waiting' }]);
});

test('deliverUpdates: a hidden tab asks at once, and asks again the next time it is hidden if the worker declined', () => {
    const waiting = fakeWorker();
    const doc = fakeDocument('hidden');
    deliverUpdates(fakeNavigator({ controller: {} }), doc, fakeRegistration({ waiting }));
    assert.equal(waiting.posted.length, 1);
    doc.visibilityState = 'visible';
    doc.listeners.visibilitychange();
    doc.hide();
    assert.equal(waiting.posted.length, 2);
});

test('deliverUpdates: the first worker (the page has no controller) is not an update', () => {
    const waiting = fakeWorker();
    deliverUpdates(fakeNavigator({ controller: null }), fakeDocument('hidden'), fakeRegistration({ waiting }));
    assert.deepEqual(waiting.posted, []);
});

test('deliverUpdates: a worker that finishes installing later is offered the same way', () => {
    const installing = fakeWorker();
    const registration = fakeRegistration({ installing: null });
    deliverUpdates(fakeNavigator({ controller: {} }), fakeDocument('hidden'), registration);
    registration.installing = installing;
    registration.listeners.updatefound();
    installing.state = 'installed';
    registration.waiting = installing;
    installing.listeners.statechange();
    assert.deepEqual(installing.posted, [{ type: 'devocionales-skip-waiting' }]);
});

test('deliverUpdates: a null registration (registration failed) or no worker support does nothing', () => {
    assert.doesNotThrow(() => deliverUpdates(fakeNavigator(), fakeDocument('hidden'), null));
    assert.doesNotThrow(() => deliverUpdates({}, fakeDocument('hidden'), fakeRegistration()));
});

test('start: wires the build answer, the update delivery and the reload together', async () => {
    const waiting = fakeWorker();
    const registration = fakeRegistration({ waiting });
    const nav = fakeNavigator({ controller: {}, registerImpl: () => Promise.resolve(registration) });
    const doc = fakeDocument('hidden');
    doc.readyState = 'complete';
    let reloads = 0;
    const win = { navigator: nav, document: doc, location: { reload() { reloads += 1; } }, addEventListener() {}, DevotionalBuild: { id: 'b' } };
    start(win, '/devocionales/sw.js', '/devocionales/', {});
    await settle();
    assert.equal(typeof nav.listeners.message, 'function');
    assert.deepEqual(waiting.posted, [{ type: 'devocionales-skip-waiting' }]);
    nav.listeners.controllerchange(); // the worker took over: reload, the tab is hidden
    assert.equal(reloads, 1);
});

test('start: with the PWA disabled none of it is wired', async () => {
    const nav = fakeNavigator();
    const win = disableWindow();
    win.navigator = { ...nav };
    win.document.readyState = 'complete';
    win.location = { reload() {} };
    win.addEventListener = () => {};
    start(win, '/devocionales/sw.js', '/devocionales/', { enabled: false });
    await settle();
    assert.deepEqual(Object.keys(nav.listeners), []);
});

// ------------------------------------------------------------ update on entry

const ENTRY_REQUEST = { type: 'devocionales-skip-waiting', entry: true };
const fakePerformance = (ms) => ({ now: () => ms.value });

test('createEntryWindow: open for the first seconds of the page, closed after, and latched once used', () => {
    const ms = { value: 100 };
    const entry = createEntryWindow(fakePerformance(ms), 5000);
    assert.equal(entry.isOpen(), true);
    ms.value = 5000;
    assert.equal(entry.isOpen(), false);
    ms.value = 4900;
    entry.latch();
    ms.value = 9000;
    assert.equal(entry.isOpen(), true, 'a request made in time still reloads when the worker answers late');
});

test('createEntryWindow: a latch expires, so a later deploy never takes over a tab that has been reading for a while', () => {
    const ms = { value: 4900 };
    const entry = createEntryWindow(fakePerformance(ms), 5000);
    entry.latch();
    ms.value = 4900 + 14000;
    assert.equal(entry.isOpen(), false);
});

test('createEntryWindow: a browser without performance.now never opens the window', () => {
    assert.equal(createEntryWindow(undefined, 5000).isOpen(), false);
    assert.equal(createEntryWindow({}, 5000).isOpen(), false);
});

test('deliverUpdates: a visible page that has only just loaded asks for an entry takeover', () => {
    const waiting = fakeWorker();
    const ms = { value: 200 };
    const entry = createEntryWindow(fakePerformance(ms), 5000);
    deliverUpdates(fakeNavigator({ controller: {} }), fakeDocument('visible'), fakeRegistration({ waiting }), entry);
    assert.deepEqual(waiting.posted, [ENTRY_REQUEST]);
});

test('deliverUpdates: after the entry window a visible page waits for the tab to be hidden', () => {
    const waiting = fakeWorker();
    const ms = { value: 9000 };
    const doc = fakeDocument('visible');
    deliverUpdates(fakeNavigator({ controller: {} }), doc, fakeRegistration({ waiting }), createEntryWindow(fakePerformance(ms), 5000));
    assert.deepEqual(waiting.posted, []);
    doc.hide();
    assert.deepEqual(waiting.posted, [{ type: 'devocionales-skip-waiting' }]);
});

test('deliverUpdates: the first worker is still no update during the entry window', () => {
    const waiting = fakeWorker();
    const entry = createEntryWindow(fakePerformance({ value: 1 }), 5000);
    deliverUpdates(fakeNavigator({ controller: null }), fakeDocument('visible'), fakeRegistration({ waiting }), entry);
    assert.deepEqual(waiting.posted, []);
});

test('deliverUpdates: a worker that finishes installing during the entry window is asked at once', () => {
    const installing = fakeWorker();
    const registration = fakeRegistration({ installing: null });
    const entry = createEntryWindow(fakePerformance({ value: 1000 }), 5000);
    deliverUpdates(fakeNavigator({ controller: {} }), fakeDocument('visible'), registration, entry);
    registration.installing = installing;
    registration.listeners.updatefound();
    installing.state = 'installed';
    registration.waiting = installing;
    installing.listeners.statechange();
    assert.deepEqual(installing.posted, [ENTRY_REQUEST]);
});

test('reloadOnUpdate: inside the entry window a visible page reloads at once, once', () => {
    const nav = fakeNavigator({ controller: {} });
    let reloads = 0;
    const entry = createEntryWindow(fakePerformance({ value: 300 }), 5000);
    reloadOnUpdate(nav, fakeDocument('visible'), () => { reloads += 1; }, entry);
    nav.listeners.controllerchange();
    nav.listeners.controllerchange();
    assert.equal(reloads, 1);
});

test('reloadOnUpdate: a takeover requested in time still reloads a visible page that answers late', () => {
    const nav = fakeNavigator({ controller: {} });
    const ms = { value: 4900 };
    const entry = createEntryWindow(fakePerformance(ms), 5000);
    entry.latch();
    ms.value = 9000;
    let reloads = 0;
    reloadOnUpdate(nav, fakeDocument('visible'), () => { reloads += 1; }, entry);
    nav.listeners.controllerchange();
    assert.equal(reloads, 1);
});

test('reloadOnUpdate: after the entry window, with no request made, a visible page still waits', () => {
    const nav = fakeNavigator({ controller: {} });
    const doc = fakeDocument('visible');
    let reloads = 0;
    reloadOnUpdate(nav, doc, () => { reloads += 1; }, createEntryWindow(fakePerformance({ value: 20000 }), 5000));
    nav.listeners.controllerchange();
    assert.equal(reloads, 0);
    doc.hide();
    assert.equal(reloads, 1);
});

test('start: wires the entry window so a freshly loaded visible page updates itself', async () => {
    const waiting = fakeWorker();
    const registration = fakeRegistration({ waiting });
    const nav = fakeNavigator({ controller: {}, registerImpl: () => Promise.resolve(registration) });
    const doc = fakeDocument('visible');
    doc.readyState = 'complete';
    let reloads = 0;
    const win = { navigator: nav, document: doc, performance: fakePerformance({ value: 400 }), location: { reload() { reloads += 1; } }, addEventListener() {} };
    start(win, '/devocionales/sw.js', '/devocionales/', {});
    await settle();
    assert.deepEqual(waiting.posted, [ENTRY_REQUEST]);
    nav.listeners.controllerchange();
    assert.equal(reloads, 1);
});

test('the entry window opens when the worker registration starts, so a slow load does not use it up', () => {
    const { createEntryWindow } = loadModule();
    let t = 0;
    const perf = { now: () => t };
    const entry = createEntryWindow(perf, 8000);
    t = 9000;
    assert.equal(entry.isOpen(), false, 'before open() a page that loaded slowly is past the window');
    entry.open();
    t = 9500;
    assert.equal(entry.isOpen(), true, 'open at 9 s, still open 0.5 s later');
    t = 17500;
    assert.equal(entry.isOpen(), false, 'closed 8 s after open()');
});

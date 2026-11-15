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

const { register, reloadOnUpdate, start } = loadModule();

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
    await Promise.resolve();
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
    await Promise.resolve();
    assert.equal(nav.calls.length, 1);
});

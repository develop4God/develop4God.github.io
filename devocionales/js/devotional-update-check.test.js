const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const filename = path.join(__dirname, 'devotional-update-check.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalUpdateCheck;
}

const { checkForNewBuild, isNewer } = loadModule();

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeWindow({ pageId = 'old1', serverBody = { id: 'new2' }, serverOk = true, fetchImpl } = {}) {
    const fetches = [];
    return {
        DevotionalBuild: pageId === null ? undefined : { id: pageId },
        AbortController,
        fetches,
        fetch: fetchImpl || ((url, options) => {
            fetches.push({ url, options });
            return Promise.resolve({ ok: serverOk, json: () => Promise.resolve(serverBody) });
        }),
    };
}

function fakeRegistration({ waiting = null } = {}) {
    const listeners = {};
    const posted = [];
    const registration = {
        waiting,
        installing: null,
        updates: 0,
        posted,
        listeners,
        addEventListener: (type, handler) => { listeners[type] = handler; },
        update() { registration.updates += 1; return Promise.resolve(); },
    };
    if (waiting) waiting.postMessage = (message) => posted.push(message);
    return registration;
}

function fakeEntry({ open = true } = {}) {
    const state = { latched: 0 };
    return { state, isOpen: () => open, latch() { state.latched += 1; } };
}

test('a build id counts as newer only when both ids are known and differ', () => {
    assert.equal(isNewer('old1', 'new2'), true);
    assert.equal(isNewer('same', 'same'), false);
    assert.equal(isNewer(undefined, 'new2'), false, 'a page without a stamp is never stale');
    assert.equal(isNewer('old1', null), false, 'an unreadable server id is never stale');
    assert.equal(isNewer('old1', ''), false);
});

test('the version file is fetched with no-store so no cache can answer for it', async () => {
    const win = fakeWindow();
    const entry = fakeEntry();
    await checkForNewBuild(win, fakeRegistration(), entry);
    assert.equal(win.fetches.length, 1);
    assert.equal(win.fetches[0].url, '/devocionales/version.json');
    assert.equal(win.fetches[0].options.cache, 'no-store');
});

test('a newer build on entry makes the browser look for the new worker at once', async () => {
    const win = fakeWindow();
    const registration = fakeRegistration();
    const result = await checkForNewBuild(win, registration, fakeEntry());
    assert.equal(result, true);
    assert.equal(registration.updates, 1, 'registration.update() must be called');
});

test('a waiting worker is asked to take over with the entry flag and the entry is latched', async () => {
    const win = fakeWindow();
    const entry = fakeEntry();
    const registration = fakeRegistration({ waiting: {} });
    await checkForNewBuild(win, registration, entry);
    assert.deepEqual(registration.posted, [{ type: 'devocionales-skip-waiting', entry: true }]);
    assert.equal(entry.state.latched, 1);
});

test('a worker that finishes installing after the check is asked to take over too', async () => {
    const win = fakeWindow();
    const entry = fakeEntry();
    const registration = fakeRegistration();
    const installing = { state: 'installing', listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    registration.update = () => {
        registration.installing = installing;
        registration.updates += 1;
        registration.listeners.updatefound();
        return Promise.resolve();
    };
    await checkForNewBuild(win, registration, entry);
    assert.deepEqual(registration.posted, [], 'nothing to ask while the worker is still installing');
    registration.waiting = { postMessage: (message) => registration.posted.push(message) };
    installing.state = 'installed';
    installing.listeners.statechange();
    assert.deepEqual(registration.posted, [{ type: 'devocionales-skip-waiting', entry: true }]);
    assert.equal(entry.state.latched, 1);
});

test('the same build on entry changes nothing', async () => {
    const win = fakeWindow({ pageId: 'same', serverBody: { id: 'same' } });
    const registration = fakeRegistration({ waiting: {} });
    const result = await checkForNewBuild(win, registration, fakeEntry());
    assert.equal(result, false);
    assert.equal(registration.updates, 0);
    assert.deepEqual(registration.posted, []);
});

test('a page the reader already used is not hurried', async () => {
    const win = fakeWindow();
    const registration = fakeRegistration({ waiting: {} });
    const result = await checkForNewBuild(win, registration, fakeEntry({ open: false }));
    assert.equal(result, false);
    assert.equal(registration.updates, 0);
    assert.deepEqual(registration.posted, []);
});

test('an offline or failing version check does nothing and never throws', async () => {
    const failing = fakeWindow({ fetchImpl: () => Promise.reject(new Error('offline')) });
    const registration = fakeRegistration();
    assert.equal(await checkForNewBuild(failing, registration, fakeEntry()), false);
    const notOk = fakeWindow({ serverOk: false });
    assert.equal(await checkForNewBuild(notOk, registration, fakeEntry()), false);
    const garbage = fakeWindow({ serverBody: { nope: true } });
    assert.equal(await checkForNewBuild(garbage, registration, fakeEntry()), false);
    assert.equal(registration.updates, 0);
});

test('no registration means no check', async () => {
    const win = fakeWindow();
    assert.equal(await checkForNewBuild(win, null, fakeEntry()), false);
    assert.equal(win.fetches.length, 0);
});

test('a failed update request reports false instead of throwing', async () => {
    const win = fakeWindow();
    const registration = fakeRegistration();
    registration.update = () => Promise.reject(new Error('refused'));
    assert.equal(await checkForNewBuild(win, registration, fakeEntry()), false);
    await settle();
});

test('a worker already installing when the check runs is asked to take over once installed', async () => {
    const win = fakeWindow();
    const entry = fakeEntry();
    const installing = { state: 'installing', listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    const registration = fakeRegistration();
    registration.installing = installing;
    await checkForNewBuild(win, registration, entry);
    assert.deepEqual(registration.posted, [], 'nothing to ask while it is still installing');
    registration.waiting = { postMessage: (message) => registration.posted.push(message) };
    installing.state = 'installed';
    installing.listeners.statechange();
    assert.deepEqual(registration.posted, [{ type: 'devocionales-skip-waiting', entry: true }]);
});

test('a version check that never answers gives up after the timeout and does nothing', async () => {
    const win = fakeWindow({ fetchImpl: (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }) });
    const registration = fakeRegistration();
    const started = Date.now();
    assert.equal(await checkForNewBuild(win, registration, fakeEntry()), false);
    assert.ok(Date.now() - started >= 900, 'waits for the timeout before giving up');
    assert.equal(registration.updates, 0);
});

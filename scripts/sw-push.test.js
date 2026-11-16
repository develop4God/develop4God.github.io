'use strict';

// Runs the push handlers (scripts/sw-push.js) in a sandbox with a fake worker scope. No Firebase
// SDK, no network, no cache: the handlers must work with nothing but showNotification and clients.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, 'sw-push.js'), 'utf8');
const ICON = '/devocionales/icons/icon-192.png';

function makeWorker({ matchAll } = {}) {
    const listeners = {};
    const shown = [];
    const opened = [];
    const self = {
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        registration: { showNotification: (title, options) => { shown.push({ title, options }); return Promise.resolve(); } },
        clients: {
            matchAll: matchAll || (() => Promise.resolve([])),
            openWindow: (url) => { opened.push(url); return Promise.resolve({ url }); },
        },
    };
    // No fetch, no caches: touching either would throw, proving the handlers never use them.
    vm.runInNewContext(SOURCE, { self, JSON, Promise, URL }, { filename: 'sw-push.js' });
    return { listeners, shown, opened };
}

// Dispatches an event and waits for what the handler handed to waitUntil.
async function dispatch(worker, type, event) {
    const waits = [];
    const full = { ...event, waitUntil: (p) => waits.push(p) };
    for (const fn of worker.listeners[type] || []) fn(full);
    await Promise.all(waits);
    return waits;
}

const payload = (obj) => ({ data: { json: () => obj, text: () => JSON.stringify(obj) } });

test('registers exactly a push and a notificationclick listener', () => {
    const worker = makeWorker();
    assert.deepEqual(Object.keys(worker.listeners).sort(), ['notificationclick', 'push']);
    assert.equal(worker.listeners.push.length, 1);
    assert.equal(worker.listeners.notificationclick.length, 1);
});

test('an FCM payload shows one notification with title, body, icon and the shell url (no badge: Android masks it to a white blob)', async () => {
    const worker = makeWorker();
    const waits = await dispatch(worker, 'push', payload({
        notification: { title: 'Daily', body: 'Read today' }, from: '1', priority: 'high', fcmMessageId: 'm',
    }));
    assert.equal(waits.length, 1, 'work is handed to waitUntil');
    assert.equal(worker.shown.length, 1);
    assert.equal(worker.shown[0].title, 'Daily');
    assert.equal(worker.shown[0].options.body, 'Read today');
    assert.equal(worker.shown[0].options.icon, ICON);
    assert.equal('badge' in worker.shown[0].options, false);
    assert.equal(worker.shown[0].options.data.url, '/devocionales/');
});

test('a payload without a notification block still shows one notification with a fallback title', async () => {
    const worker = makeWorker();
    await dispatch(worker, 'push', payload({ from: '1', fcmMessageId: 'm' }));
    assert.equal(worker.shown.length, 1);
    assert.ok(worker.shown[0].title && typeof worker.shown[0].title === 'string');
});

test('a data-only payload shows one notification using its title and body fields', async () => {
    const worker = makeWorker();
    await dispatch(worker, 'push', payload({ data: { title: 'D', body: 'B' } }));
    assert.equal(worker.shown.length, 1);
    assert.equal(worker.shown[0].title, 'D');
    assert.equal(worker.shown[0].options.body, 'B');
});

test('a data-only payload without title or body still shows one notification', async () => {
    const worker = makeWorker();
    await dispatch(worker, 'push', payload({ data: { other: 'x' } }));
    assert.equal(worker.shown.length, 1);
    assert.ok(worker.shown[0].title);
});

test('a non-JSON text payload becomes the body of one notification', async () => {
    const worker = makeWorker();
    await dispatch(worker, 'push', {
        data: { json: () => { throw new SyntaxError('bad'); }, text: () => 'plain words' },
    });
    assert.equal(worker.shown.length, 1);
    assert.equal(worker.shown[0].options.body, 'plain words');
    assert.ok(worker.shown[0].title);
});

test('a payload whose text cannot be read does not throw and still shows one notification', async () => {
    const worker = makeWorker();
    await dispatch(worker, 'push', {
        data: { json: () => { throw new Error('x'); }, text: () => { throw new Error('y'); } },
    });
    assert.equal(worker.shown.length, 1);
});

test('an empty push (no data) shows one fallback notification', async () => {
    const worker = makeWorker();
    await dispatch(worker, 'push', {});
    assert.equal(worker.shown.length, 1);
    assert.ok(worker.shown[0].title);
});

test('JSON that is not an object (null, a number) shows one notification', async () => {
    for (const value of [null, 7, 'str']) {
        const worker = makeWorker();
        await dispatch(worker, 'push', payload(value));
        assert.equal(worker.shown.length, 1, String(value));
    }
});

test('the language of the payload data is passed on when present', async () => {
    const worker = makeWorker();
    await dispatch(worker, 'push', payload({ notification: { title: 'T' }, data: { lang: 'es' } }));
    assert.equal(worker.shown[0].options.lang, 'es');
});

const win = (url, extra = {}) => ({ url, focus: () => { win.focused.push(url); return Promise.resolve(); }, ...extra });
win.focused = [];

function click(worker, closed = []) {
    return dispatch(worker, 'notificationclick', { notification: { close: () => closed.push(1) } });
}

test('a click closes the notification and focuses an open /devocionales/ window instead of opening one', async () => {
    win.focused.length = 0;
    const worker = makeWorker({
        matchAll: (options) => {
            assert.equal(JSON.stringify(options), JSON.stringify({ type: 'window', includeUncontrolled: true }));
            return Promise.resolve([win('http://localhost/other/'), win('http://localhost/devocionales/privacy-policy.html'), win('http://localhost/devocionales/terms-and-conditions.html'), win('http://localhost/devocionales/index.html')]);
        },
    });
    const closed = [];
    const waits = await click(worker, closed);
    assert.equal(waits.length, 1);
    assert.equal(closed.length, 1);
    assert.deepEqual(win.focused, ['http://localhost/devocionales/index.html']);
    assert.deepEqual(worker.opened, []);
});

test('a click opens /devocionales/ when no window of the reader is open', async () => {
    const worker = makeWorker({ matchAll: () => Promise.resolve([win('http://localhost/'), win('http://localhost/devocionalesx/')]) });
    const closed = [];
    await click(worker, closed);
    assert.equal(closed.length, 1);
    assert.deepEqual(worker.opened, ['/devocionales/']);
});

test('a click still opens the reader when matchAll rejects', async () => {
    const worker = makeWorker({ matchAll: () => Promise.reject(new Error('boom')) });
    const closed = [];
    await click(worker, closed);
    assert.equal(closed.length, 1);
    assert.deepEqual(worker.opened, ['/devocionales/']);
});

test('a click still opens the reader when focusing fails', async () => {
    const worker = makeWorker({
        matchAll: () => Promise.resolve([{ url: 'http://localhost/devocionales/', focus: () => Promise.reject(new Error('no')) }]),
    });
    await click(worker);
    assert.deepEqual(worker.opened, ['/devocionales/']);
});

test('the handlers never touch the network or the caches', () => {
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bfetch\s*\(|\bcaches\b|importScripts|firebase/i);
});

test('a click opens the reader when only legal pages are open', async () => {
    win.focused.length = 0;
    const worker = makeWorker({
        matchAll: () => Promise.resolve([win('http://localhost/devocionales/privacy-policy.html'), win('http://localhost/devocionales/terms-and-conditions.html')]),
    });
    await click(worker);
    assert.deepEqual(win.focused, []);
    assert.deepEqual(worker.opened, ['/devocionales/']);
});

test('every notification carries one shared tag and renotify so queued days collapse', async () => {
    const worker = makeWorker();
    await dispatch(worker, 'push', payload({ notification: { title: 'T' } }));
    assert.equal(worker.shown[0].options.tag, 'daily-devotional');
    assert.equal(worker.shown[0].options.renotify, true);
});

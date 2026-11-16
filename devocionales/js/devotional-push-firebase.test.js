const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const filename = path.join(__dirname, 'devotional-push-firebase.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalPushFirebase;
}

const DevotionalPushFirebase = loadModule();

const CONFIG = {
    firebase: { apiKey: 'k', authDomain: 'd', projectId: 'p', messagingSenderId: 's', appId: 'a' },
};
const BASE = '/devocionales/vendor/firebase/';
const FILES = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js', 'firebase-messaging-compat.js'];

// A fake Firebase compat namespace; records every call so tests can assert the mapping.
function fakeFirebase({ user = null, createdApp = false } = {}) {
    const calls = [];
    const state = { user, listeners: [] };
    const auth = {
        get currentUser() { return state.user; },
        onAuthStateChanged(cb) {
            calls.push(['onAuthStateChanged']);
            Promise.resolve().then(() => cb(state.user));
            return () => calls.push(['unsubscribeAuth']);
        },
        async signInAnonymously() {
            calls.push(['signInAnonymously']);
            state.user = { uid: 'anon-1', delete: async () => { calls.push(['userDelete']); state.user = null; } };
            return { user: state.user };
        },
        async signOut() { calls.push(['signOut']); state.user = null; },
    };
    const firestore = {
        doc(p) {
            return {
                set: async (data, opts) => { calls.push(['set', p, data, opts]); },
                delete: async () => { calls.push(['delete', p]); },
            };
        },
    };
    const messaging = {
        getToken: async (opts) => { calls.push(['getToken', opts]); messaging.registrationSet = true; return 'tok'; },
        deleteToken: async () => {
            calls.push(['deleteToken']);
            if (!messaging.registrationSet && !state.allowDefaultWorker) {
                const err = new Error('default worker /firebase-messaging-sw.js 404');
                err.code = 'messaging/failed-service-worker-registration';
                throw err;
            }
            return true;
        },
    };
    const fb = {
        calls,
        state,
        apps: createdApp ? [{ name: '[DEFAULT]' }] : [],
        initializeApp(cfg) { calls.push(['initializeApp', cfg]); this.apps.push({ name: '[DEFAULT]' }); },
        auth: () => auth,
        firestore: Object.assign(() => firestore, { FieldValue: { serverTimestamp: () => 'TS' } }),
        messaging: () => messaging,
    };
    return fb;
}

// failOn: file names whose script fires onerror instead of onload.
function fakeWindow({ failOn = [], firebase, notification, push = true, sw = true, registration = { scope: '/devocionales/', active: {} } } = {}) {
    const appended = [];
    const scripts = [];
    const removed = [];
    const failing = new Set(failOn);
    const win = {
        appended,
        scripts,
        removed,
        failing,
        document: {
            createElement: (tag) => ({ tag, remove() { win.removed.push(this.src); } }),
            head: {
                appendChild(el) {
                    appended.push(el.src);
                    scripts.push(el);
                    const name = el.src.split('/').pop();
                    setImmediate(() => {
                        if (failing.has(name)) { el.onerror(new Error('boom')); return; }
                        if (name === FILES[0]) win.firebase = firebase || fakeFirebase();
                        el.onload();
                    });
                },
            },
        },
    };
    if (notification !== undefined) win.Notification = notification;
    if (push) win.PushManager = function PushManager() {};
    win.registrationRequests = [];
    win.navigator = sw ? {
        serviceWorker: {
            getRegistration: async (scope) => { win.registrationRequests.push(scope); return registration; },
            ready: Promise.resolve(registration),
        },
    } : {};
    return win;
}

const granted = { permission: 'granted', requestPermission: async () => 'granted' };

test('create has no side effects: no script injected, no SDK touched', () => {
    const win = fakeWindow({ notification: granted });
    DevotionalPushFirebase.create(win, CONFIG);
    assert.deepEqual(win.appended, []);
    assert.equal(win.firebase, undefined);
});

test('exposes exactly the contract methods', () => {
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted }), CONFIG);
    assert.deepEqual(Object.keys(adapter).sort(), [
        'currentUid', 'db', 'deleteToken', 'getToken', 'load', 'permission',
        'registration', 'requestPermission', 'signInAnonymously', 'supported',
    ]);
});

test('load injects the four vendored scripts, app first, executing in order', async () => {
    const win = fakeWindow({ notification: granted });
    const adapter = DevotionalPushFirebase.create(win, CONFIG);
    await adapter.load();
    assert.deepEqual(win.appended, FILES.map((f) => BASE + f));
});

test('D8: all four tags are created up front, in parallel, with async=false so execution order is kept', async () => {
    const win = fakeWindow({ notification: granted });
    const adapter = DevotionalPushFirebase.create(win, CONFIG);
    const pending = adapter.load();
    assert.equal(win.appended.length, 4, 'no tag waits for the previous one to load');
    assert.ok(win.scripts.every((script) => script.async === false));
    await pending;
});

test('load is single flight and idempotent', async () => {
    const win = fakeWindow({ notification: granted });
    const adapter = DevotionalPushFirebase.create(win, CONFIG);
    const [a, b] = [adapter.load(), adapter.load()];
    await Promise.all([a, b]);
    await adapter.load();
    assert.equal(win.appended.length, 4);
});

test('load initializes the app once from config.firebase', async () => {
    const fb = fakeFirebase();
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fb }), CONFIG);
    await adapter.load();
    await adapter.load();
    assert.deepEqual(fb.calls.filter((c) => c[0] === 'initializeApp'), [['initializeApp', CONFIG.firebase]]);
});

test('load reuses an existing app instead of initializing again', async () => {
    const fb = fakeFirebase({ createdApp: true });
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fb }), CONFIG);
    await adapter.load();
    assert.equal(fb.calls.some((c) => c[0] === 'initializeApp'), false);
});

test('load rejects on a script error, never reports loaded, and a retry succeeds', async () => {
    const win = fakeWindow({ notification: granted, failOn: [FILES[1]] });
    const adapter = DevotionalPushFirebase.create(win, CONFIG);
    await assert.rejects(adapter.load(), /firebase-auth-compat/);
    await assert.rejects(adapter.signInAnonymously(), /load\(\) first/);
    win.failing.clear();
    await adapter.load();
    assert.equal(win.firebase.apps.length, 1);
});

test('load rejects with a clear error when config.firebase is missing, without injecting', async () => {
    for (const config of [undefined, {}, { firebase: {} }, { firebase: { apiKey: 'k' } }]) {
        const win = fakeWindow({ notification: granted });
        const adapter = DevotionalPushFirebase.create(win, config);
        await assert.rejects(adapter.load(), /firebase config/i);
        assert.deepEqual(win.appended, []);
    }
});

test('SDK methods reject clearly when load() was not called', async () => {
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted }), CONFIG);
    await assert.rejects(adapter.signInAnonymously(), /load/i);
    await assert.rejects(adapter.db.set('users/x', {}), /load/i);
});

test('db maps onto firestore doc(path)', async () => {
    const fb = fakeFirebase();
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fb }), CONFIG);
    await adapter.load();
    await adapter.db.set('users/u/settings/notifications', { x: 1 }, { merge: true });
    await adapter.db.delete('users/u');
    assert.equal(adapter.db.serverTimestamp(), 'TS');
    assert.equal(adapter.db.get, undefined, 'the mirror writes never read');
    assert.deepEqual(fb.calls.filter((c) => ['set', 'delete'].includes(c[0])), [
        ['set', 'users/u/settings/notifications', { x: 1 }, { merge: true }],
        ['delete', 'users/u'],
    ]);
});

test('signInAnonymously signs in once and reuses an existing session', async () => {
    const fb = fakeFirebase();
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fb }), CONFIG);
    await adapter.load();
    assert.equal(await adapter.signInAnonymously(), 'anon-1');
    assert.equal(await adapter.signInAnonymously(), 'anon-1');
    assert.equal(fb.calls.filter((c) => c[0] === 'signInAnonymously').length, 1);
});

test('signInAnonymously reuses a restored session without a network sign-in', async () => {
    const fb = fakeFirebase({ user: { uid: 'old' } });
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fb }), CONFIG);
    await adapter.load();
    assert.equal(await adapter.signInAnonymously(), 'old');
    assert.equal(fb.calls.some((c) => c[0] === 'signInAnonymously'), false);
});

test('D10: an onAuthStateChanged that calls back synchronously still resolves, and unsubscribes', async () => {
    const fb = fakeFirebase({ user: { uid: 'sync-1' } });
    let unsubscribed = 0;
    fb.auth().onAuthStateChanged = (cb) => {
        cb({ uid: 'sync-1' });
        return () => { unsubscribed += 1; };
    };
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fb }), CONFIG);
    await adapter.load();
    assert.equal(await adapter.currentUid(), 'sync-1');
    assert.equal(unsubscribed, 1);
});

test('currentUid waits for the auth state and returns the uid or null', async () => {
    const withUser = fakeFirebase({ user: { uid: 'u1' } });
    const a = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: withUser }), CONFIG);
    await a.load();
    assert.equal(await a.currentUid(), 'u1');
    assert.ok(withUser.calls.some((c) => c[0] === 'onAuthStateChanged'));
    const none = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fakeFirebase() }), CONFIG);
    await none.load();
    assert.equal(await none.currentUid(), null);
});

test('getToken passes the registration and no vapidKey by default', async () => {
    const fb = fakeFirebase();
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fb }), CONFIG);
    await adapter.load();
    const reg = { scope: '/devocionales/' };
    assert.equal(await adapter.getToken(reg), 'tok');
    const [, opts] = fb.calls.find((c) => c[0] === 'getToken');
    assert.deepEqual(opts, { serviceWorkerRegistration: reg });
    assert.equal('vapidKey' in opts, false);
});

test('getToken passes vapidKey when configured', async () => {
    const fb = fakeFirebase();
    const config = { firebase: Object.assign({ vapidKey: 'VAPID' }, CONFIG.firebase) };
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fb }), config);
    await adapter.load();
    const reg = {};
    await adapter.getToken(reg);
    assert.deepEqual(fb.calls.find((c) => c[0] === 'getToken')[1], { serviceWorkerRegistration: reg, vapidKey: 'VAPID' });
});

const SDK_CALLS = ['getToken', 'deleteToken'];
const sdkCalls = (fb) => fb.calls.filter((c) => SDK_CALLS.includes(c[0])).map((c) => c[0]);

test('R3-2: granted: deleteToken binds the page registration through getToken, then deletes', async () => {
    const fb = fakeFirebase();
    const win = fakeWindow({ notification: granted, firebase: fb });
    const adapter = DevotionalPushFirebase.create(win, CONFIG);
    await adapter.load();
    await adapter.deleteToken();
    assert.deepEqual(win.registrationRequests, ['/devocionales/']);
    assert.deepEqual(sdkCalls(fb), ['getToken', 'deleteToken']);
    assert.equal(fb.calls.find((c) => c[0] === 'getToken')[1].serviceWorkerRegistration.scope, '/devocionales/');
});

test('R3-2: denied or default permission: deleteToken resolves without any SDK call and never prompts', async () => {
    for (const permission of ['denied', 'default']) {
        const fb = fakeFirebase();
        let prompted = 0;
        const notification = { permission, requestPermission: async () => { prompted += 1; return permission; } };
        const adapter = DevotionalPushFirebase.create(fakeWindow({ notification, firebase: fb }), CONFIG);
        await adapter.load();
        await adapter.deleteToken();
        assert.deepEqual(sdkCalls(fb), [], permission);
        assert.equal(prompted, 0, permission);
    }
});

test('R3-2: no registration: deleteToken resolves without touching the SDK', async () => {
    const fb = fakeFirebase();
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fb, registration: null }), CONFIG);
    await adapter.load();
    await adapter.deleteToken();
    assert.deepEqual(sdkCalls(fb), []);
});

test('R3-5: registration() is the one lookup: the active registration, or ready when not active yet, or null', async () => {
    const active = { scope: '/devocionales/', active: {} };
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, registration: active }), CONFIG);
    assert.equal(await adapter.registration(), active);
    const waiting = { scope: '/devocionales/', active: null };
    const win = fakeWindow({ notification: granted, registration: waiting });
    const ready = { scope: '/devocionales/', active: {} };
    win.navigator.serviceWorker.ready = Promise.resolve(ready);
    assert.equal(await DevotionalPushFirebase.create(win, CONFIG).registration(), ready);
    assert.equal(await DevotionalPushFirebase.create(fakeWindow({ notification: granted, registration: null }), CONFIG).registration(), null);
});

test('D6: a retry loads only the scripts that failed and removes the failed tag', async () => {
    const win = fakeWindow({ notification: granted, failOn: [FILES[1]] });
    const adapter = DevotionalPushFirebase.create(win, CONFIG);
    await assert.rejects(adapter.load());
    assert.equal(win.appended.length, 4);
    assert.deepEqual(win.removed, [BASE + FILES[1]]);
    win.failing.clear();
    await adapter.load();
    assert.deepEqual(win.appended.slice(4), [BASE + FILES[1]]);
});

test('D6: when app-compat itself failed, a retry reloads everything', async () => {
    const win = fakeWindow({ notification: granted, failOn: [FILES[0]] });
    const adapter = DevotionalPushFirebase.create(win, CONFIG);
    await assert.rejects(adapter.load());
    win.failing.clear();
    await adapter.load();
    assert.equal(win.appended.length, 8);
});

test('deleteToken delegates to messaging', async () => {
    const fb = fakeFirebase();
    const adapter = DevotionalPushFirebase.create(fakeWindow({ notification: granted, firebase: fb }), CONFIG);
    await adapter.load();
    await adapter.deleteToken();
    assert.ok(fb.calls.some((c) => c[0] === 'deleteToken'));
});

test('supported requires Notification, PushManager and serviceWorker', () => {
    const make = (opts) => DevotionalPushFirebase.create(fakeWindow(opts), CONFIG);
    assert.equal(make({ notification: granted }).supported(), true);
    assert.equal(make({}).supported(), false, 'no Notification');
    assert.equal(make({ notification: granted, push: false }).supported(), false, 'no PushManager');
    assert.equal(make({ notification: granted, sw: false }).supported(), false, 'no serviceWorker');
});

test('permission reports the Notification state, default when unsupported', () => {
    for (const p of ['default', 'granted', 'denied']) {
        assert.equal(DevotionalPushFirebase.create(fakeWindow({ notification: { permission: p } }), CONFIG).permission(), p);
    }
    assert.equal(DevotionalPushFirebase.create(fakeWindow({}), CONFIG).permission(), 'default');
});

test('requestPermission resolves the result, supports the callback form, and rejects when unsupported', async () => {
    const promiseForm = DevotionalPushFirebase.create(fakeWindow({ notification: { permission: 'default', requestPermission: async () => 'denied' } }), CONFIG);
    assert.equal(await promiseForm.requestPermission(), 'denied');
    const callbackForm = DevotionalPushFirebase.create(fakeWindow({ notification: { permission: 'default', requestPermission: (cb) => { cb('granted'); } } }), CONFIG);
    assert.equal(await callbackForm.requestPermission(), 'granted');
    await assert.rejects(DevotionalPushFirebase.create(fakeWindow({}), CONFIG).requestPermission());
});

test('R5-6: a registration that never becomes active rejects with registration-timeout; no registration at all is null', async () => {
    const waiting = { scope: '/devocionales/', active: null };
    const win = fakeWindow({ notification: granted, registration: waiting });
    win.navigator.serviceWorker.ready = new Promise(() => {});
    const adapter = DevotionalPushFirebase.create(win, CONFIG, { readyTimeoutMs: 20 });
    await assert.rejects(adapter.registration(), (err) => err.name === 'registration-timeout');
    const none = DevotionalPushFirebase.create(fakeWindow({ notification: granted, registration: null }), CONFIG);
    assert.equal(await none.registration(), null);
});

test('R5-6: deleteToken rejects on a stuck worker (the erase must be retried) and the repeat does not wait again', async () => {
    const fb = fakeFirebase();
    const waiting = { scope: '/devocionales/', active: null };
    const win = fakeWindow({ notification: granted, firebase: fb, registration: waiting });
    let readyReads = 0;
    Object.defineProperty(win.navigator.serviceWorker, 'ready', { get: () => { readyReads += 1; return new Promise(() => {}); } });
    const adapter = DevotionalPushFirebase.create(win, CONFIG, { readyTimeoutMs: 20 });
    await adapter.load();
    await assert.rejects(adapter.deleteToken(), (err) => err.name === 'registration-timeout');
    const started = Date.now();
    await assert.rejects(adapter.deleteToken(), (err) => err.name === 'registration-timeout');
    assert.ok(Date.now() - started < 15, 'the second call reuses the recent timeout');
    assert.equal(readyReads, 1);
    assert.deepEqual(sdkCalls(fb), []);
});

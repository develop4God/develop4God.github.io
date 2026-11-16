const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The facade reads its sibling modules and the PWA helpers from the window, as in the page.
function loadInto(win, file) {
    const filename = path.join(__dirname, file);
    const source = fs.readFileSync(filename, 'utf8');
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
}

const globals = {};
loadInto(globals, 'devotional-standalone.js');
loadInto(globals, 'devotional-ios-hint.js');
loadInto(globals, 'devotional-push-store.js');
loadInto(globals, 'devotional-push.js');
const { init } = globals.DevotionalPush;

const UA = {
    desktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

function fakeEl(startHidden = true) {
    const classes = new Set(startHidden ? ['hidden'] : []);
    const listeners = {};
    return {
        listeners,
        textContent: '',
        disabled: false,
        value: '',
        classList: {
            add: (n) => classes.add(n),
            remove: (n) => classes.delete(n),
            contains: (n) => classes.has(n),
        },
        addEventListener: (type, handler) => { listeners[type] = handler; },
        get shown() { return !classes.has('hidden'); },
    };
}

function fakeDoc({ withButtons = true } = {}) {
    const els = {
        '[data-push]': fakeEl(),
        '[data-push-enable]': fakeEl(),
        '[data-push-disable]': fakeEl(),
        '[data-push-hour]': Object.assign(fakeEl(false), { options: [] }),
        '[data-push-status]': fakeEl(false),
    };
    return {
        els,
        querySelector: (selector) => {
            if (!withButtons && selector !== '[data-push]') return null;
            return els[selector] || null;
        },
    };
}

// Defaults to the installed app: the push UI only exists there. Browser-tab cases pass standalone: false.
function fakeWin({ ua = UA.desktop, standalone = true, i18nLang } = {}) {
    const win = Object.create(globals);
    win.navigator = { userAgent: ua, standalone: standalone ? true : undefined };
    win.matchMedia = () => ({ matches: false });
    win.i18n = i18nLang ? { currentLang: i18nLang, translations: { push: {} } } : undefined;
    return win;
}

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        get: (k) => (k in data ? data[k] : null),
        set: (k, v) => { data[k] = String(v); },
        remove: (k) => { delete data[k]; },
    };
}

// One ordered log for adapter calls and Firestore writes. The db has no `get`: any read fails.
function fakeAdapter(overrides = {}) {
    const log = [];
    const writes = [];
    const rec = (name, value) => (...args) => {
        log.push(name);
        return typeof value === 'function' ? value(...args) : value;
    };
    const db = {
        serverTimestamp: () => 'TS',
        set: (p, data, options) => { log.push(`set ${p}`); writes.push({ op: 'set', path: p, data, options }); return Promise.resolve(); },
        delete: (p) => { log.push(`delete ${p}`); writes.push({ op: 'delete', path: p }); return Promise.resolve(); },
    };
    const adapter = {
        log,
        writes,
        db,
        supported: () => true,
        permission: () => 'default',
        requestPermission: rec('requestPermission', () => Promise.resolve('granted')),
        load: rec('load', () => Promise.resolve()),
        signInAnonymously: rec('signInAnonymously', () => Promise.resolve('uid1')),
        currentUid: rec('currentUid', () => Promise.resolve('uid1')),
        registration: rec('registration', () => Promise.resolve({ scope: '/devocionales/', active: {} })),
        getToken: rec('getToken', () => Promise.resolve('tok1')),
        deleteToken: rec('deleteToken', () => Promise.resolve()),
    };
    for (const [key, value] of Object.entries(overrides)) adapter[key] = ['supported', 'permission'].includes(key) ? value : rec(key, value);
    return adapter;
}

const t = (key) => `T:${key}`;
const CONFIG = { enabled: true, pushEnabled: true };
const OPTED = { 'devotionalPush.optedIn': '1', 'devotionalPush.token': 'tok1' };
// The app's order on every entry: lastLogin, token, settings.
const WRITES = ['set users/uid1', 'set users/uid1/fcmTokens/tok1', 'set users/uid1/settings/notifications'];

function setup({ adapter, storage, win, doc, config = CONFIG } = {}) {
    const ctx = {
        adapter: adapter || fakeAdapter(),
        storage: storage || fakeStorage(),
        win: win || fakeWin({ i18nLang: 'es' }),
        doc: doc || fakeDoc(),
    };
    ctx.i18nState = fakeI18n(true);
    ctx.deps = { adapter: ctx.adapter, storage: ctx.storage, t, i18n: ctx.i18nState.i18n, i18nWaitMs: 20 };
    ctx.run = () => init(ctx.doc, ctx.win, config, ctx.deps);
    ctx.el = (name) => ctx.doc.els[`[data-push${name ? `-${name}` : ''}]`];
    ctx.tap = async (name) => { ctx.el(name).listeners.click(); await flush(); };
    return ctx;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const tick = async () => { for (let i = 0; i < 20; i += 1) await flush(); };

test('A1: init for a new reader shows the enable button; no prompt, no SDK, no Firebase call', async () => {
    const ctx = setup();
    await ctx.run();
    assert.equal(ctx.el('').shown, true);
    assert.equal(ctx.el('enable').shown, true);
    assert.equal(ctx.el('disable').shown, false);
    assert.deepEqual(ctx.adapter.log, []);
    assert.deepEqual(ctx.storage.data, {});
});

test('A1: the static HTML owns the hour options: the facade preselects the stored hour', async () => {
    const ctx = setup({ storage: fakeStorage({ 'devotionalPush.hour': '19' }) });
    await ctx.run();
    assert.equal(ctx.el('hour').options.length, 0);
    assert.equal(ctx.el('hour').value, '19');
});

test('no config object at all: nothing is touched, even for an opted-in reader', async () => {
    const ctx = setup({ config: null, storage: fakeStorage(OPTED) });
    await ctx.run();
    assert.equal(ctx.el('').shown, false);
    assert.deepEqual(ctx.adapter.log, []);
    assert.deepEqual(ctx.storage.data, OPTED);
});

test('explicit config with pushEnabled off and no opted-in flag: hidden, nothing touched', async () => {
    for (const config of [{ enabled: true }, { enabled: true, pushEnabled: false }, { enabled: false, pushEnabled: true }]) {
        const ctx = setup({ config });
        await ctx.run();
        assert.equal(ctx.el('').shown, false);
        assert.deepEqual(ctx.adapter.log, []);
    }
});

test('kill switch with the opted-in flag runs the disable flow and clears the flags', async () => {
    const ctx = setup({ config: { enabled: true, pushEnabled: false }, storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '9' }) });
    await ctx.run();
    assert.equal(ctx.el('').shown, false);
    assert.deepEqual(ctx.adapter.log, ['load', 'currentUid', 'set users/uid1/settings/notifications', 'delete users/uid1/fcmTokens/tok1', 'deleteToken']);
    assert.equal(ctx.adapter.writes[0].data.notificationsEnabled, false);
    assert.ok(!ctx.adapter.log.includes('requestPermission'));
    assert.equal(ctx.storage.data['devotionalPush.optedIn'], undefined);
    assert.equal(ctx.storage.data['devotionalPush.token'], undefined);
});

test('A2: unsupported browser keeps the container hidden and touches nothing', async () => {
    const ctx = setup({ adapter: fakeAdapter({ supported: () => false }), storage: fakeStorage(OPTED) });
    await ctx.run();
    assert.equal(ctx.el('').shown, false);
    assert.deepEqual(ctx.adapter.log, []);
});

test('A2: iOS Safari outside standalone shows only the install text', async () => {
    const ctx = setup({ win: fakeWin({ ua: UA.iphone, standalone: false }), adapter: fakeAdapter({ supported: () => false }) });
    await ctx.run();
    assert.equal(ctx.el('').shown, true);
    assert.equal(ctx.el('status').textContent, 'T:push.status_ios_install');
    for (const name of ['enable', 'disable', 'hour']) assert.equal(ctx.el(name).shown, false);
    assert.deepEqual(ctx.adapter.log, []);
});

test('A2: iOS installed (standalone) gets the normal enable button', async () => {
    const ctx = setup({ win: fakeWin({ ua: UA.iphone, standalone: true }) });
    await ctx.run();
    assert.equal(ctx.el('enable').shown, true);
    assert.notEqual(ctx.el('status').textContent, 'T:push.status_ios_install');
});

test('A3: denied or dismissed permission shows the denied text and calls no Firebase', async () => {
    for (const answer of ['denied', 'default']) {
        const ctx = setup({ adapter: fakeAdapter({ requestPermission: () => Promise.resolve(answer) }) });
        await ctx.run();
        await ctx.tap('enable');
        assert.equal(ctx.el('status').textContent, 'T:push.status_denied');
        assert.deepEqual(ctx.adapter.log, ['requestPermission']);
        assert.deepEqual(ctx.storage.data, {});
        assert.equal(ctx.el('enable').shown, true);
    }
});

test('enable: permission is requested synchronously inside the click, before any await', async () => {
    const ctx = setup();
    await ctx.run();
    ctx.el('enable').listeners.click();
    assert.deepEqual(ctx.adapter.log, ['requestPermission']);
    await flush();
});

test('enable: a rejecting requestPermission shows the error and leaves the button usable', async () => {
    const ctx = setup({ adapter: fakeAdapter({ requestPermission: () => Promise.reject(new Error('x')) }) });
    await ctx.run();
    await ctx.tap('enable');
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assert.equal(ctx.el('enable').disabled, false);
});

test('enable: happy path in the app write order, with the raw token, hour, timezone and language', async () => {
    const ctx = setup({ storage: fakeStorage({ 'devotionalPush.hour': '7' }) });
    await ctx.run();
    await ctx.tap('enable');
    assert.deepEqual(ctx.adapter.log, ['requestPermission', 'load', 'signInAnonymously', 'registration', 'getToken', ...WRITES]);
    const settings = ctx.adapter.writes[2].data;
    assert.equal(settings.notificationsEnabled, true);
    assert.equal(settings.notificationTime, '07:00');
    assert.equal(settings.preferredLanguage, 'es');
    assert.equal(settings.userTimezone, Intl.DateTimeFormat().resolvedOptions().timeZone);
    assert.equal(ctx.adapter.writes[1].data.token, 'tok1');
    assert.equal(ctx.storage.data['devotionalPush.optedIn'], '1');
    assert.equal(ctx.storage.data['devotionalPush.token'], 'tok1');
    assert.equal(ctx.el('disable').shown, true);
    assert.equal(ctx.el('enable').shown, false);
    assert.equal(ctx.el('status').textContent, 'T:push.status_enabled');
});

test('enable: the language is omitted until i18n has finished loading', async () => {
    const ctx = setup();
    ctx.i18nState.ready = false;
    await ctx.run();
    await ctx.tap('enable');
    assert.equal('preferredLanguage' in ctx.adapter.writes[2].data, false);
});

test('enable: no service worker registration (null) is an error and writes nothing', async () => {
    const ctx = setup({ adapter: fakeAdapter({ registration: () => Promise.resolve(null) }) });
    await ctx.run();
    await ctx.tap('enable');
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assert.deepEqual(ctx.adapter.writes, []);
    assert.deepEqual(ctx.storage.data, {});
    assert.equal(ctx.el('enable').disabled, false);
});

test('enable: a failing step (registration, token, sign-in or write) is an error and the button is usable again', async () => {
    const failing = [
        { registration: () => Promise.reject(new Error('timeout')) },
        { getToken: () => Promise.reject(new Error('no token')) },
        { signInAnonymously: () => Promise.reject(new Error('offline')) },
    ];
    for (const overrides of failing) {
        const ctx = setup({ adapter: fakeAdapter(overrides) });
        await ctx.run();
        await ctx.tap('enable');
        assert.equal(ctx.el('status').textContent, 'T:push.status_error');
        assert.equal(ctx.storage.data['devotionalPush.optedIn'], undefined);
        assert.equal(ctx.el('enable').disabled, false);
        assert.equal(ctx.el('enable').shown, true);
    }
    const ctx = setup();
    ctx.adapter.db.set = () => Promise.reject(new Error('rules'));
    await ctx.run();
    await ctx.tap('enable');
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assert.equal(ctx.storage.data['devotionalPush.optedIn'], undefined);
});

test('enable: a double tap while busy is ignored and the button is disabled meanwhile', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = setup({ adapter: fakeAdapter({ getToken: () => gate.then(() => 'tok1') }) });
    await ctx.run();
    ctx.el('enable').listeners.click();
    await tick();
    assert.equal(ctx.el('enable').disabled, true);
    ctx.el('enable').listeners.click();
    await tick();
    assert.equal(ctx.adapter.log.filter((c) => c === 'requestPermission').length, 1);
    release();
    await tick();
    assert.equal(ctx.adapter.writes.length, 3);
    assert.equal(ctx.el('enable').disabled, false);
});

test('opted in and granted: every entry does the three writes in order with no reads and no prompt', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '6' }) });
    await ctx.run();
    assert.deepEqual(ctx.adapter.log, ['load', 'currentUid', 'registration', 'getToken', ...WRITES]);
    assert.equal(ctx.adapter.writes[2].data.notificationTime, '06:00');
    assert.equal('lastNotificationSentDate' in ctx.adapter.writes[2].data, false);
    assert.equal(ctx.el('disable').shown, true);
    // The next entry writes again: there is no throttle.
    const again = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: ctx.storage });
    await again.run();
    assert.deepEqual(again.adapter.writes.map((w) => w.path), WRITES.map((w) => w.replace('set ', '')));
});

test('opted in: signs in anonymously only when there is no current user', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted', currentUid: () => Promise.resolve(null) }), storage: fakeStorage(OPTED) });
    await ctx.run();
    assert.ok(ctx.adapter.log.includes('signInAnonymously'));
    assert.deepEqual(ctx.adapter.log.slice(-3), WRITES);
});

test('opted in: a null or rejecting registration skips silently and keeps the opted-in state', async () => {
    for (const registration of [() => Promise.resolve(null), () => Promise.reject(new Error('registration-timeout'))]) {
        const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted', registration }), storage: fakeStorage(OPTED) });
        await ctx.run();
        assert.deepEqual(ctx.adapter.writes, []);
        assert.ok(!ctx.adapter.log.includes('signInAnonymously'));
        assert.equal(ctx.storage.data['devotionalPush.optedIn'], '1');
        assert.equal(ctx.el('status').textContent, 'T:push.status_enabled');
    }
});

test('opted in: a failing write is silent and keeps the opted-in state for the next visit', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    ctx.adapter.db.set = () => Promise.reject(new Error('offline'));
    await assert.doesNotReject(ctx.run());
    assert.equal(ctx.storage.data['devotionalPush.optedIn'], '1');
    assert.equal(ctx.el('status').textContent, 'T:push.status_enabled');
    assert.equal(ctx.el('disable').disabled, false);
});

test('A4: permission revoked while opted in runs the disable flow and shows the enable button', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'denied' }), storage: fakeStorage(OPTED) });
    await ctx.run();
    assert.deepEqual(ctx.adapter.log, ['load', 'currentUid', 'set users/uid1/settings/notifications', 'delete users/uid1/fcmTokens/tok1', 'deleteToken']);
    assert.equal(ctx.el('enable').shown, true);
    assert.equal(ctx.el('disable').shown, false);
    assert.equal(ctx.storage.data['devotionalPush.optedIn'], undefined);
});

test('A5: disable tap writes notificationsEnabled false, removes this token, deletes it and clears the flags', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    await ctx.run();
    ctx.adapter.log.length = 0;
    ctx.adapter.writes.length = 0;
    await ctx.tap('disable');
    assert.deepEqual(ctx.adapter.log, ['load', 'currentUid', 'set users/uid1/settings/notifications', 'delete users/uid1/fcmTokens/tok1', 'deleteToken']);
    assert.deepEqual(Object.keys(ctx.adapter.writes[0].data).sort(), ['lastUpdated', 'notificationsEnabled']);
    assert.deepEqual(ctx.adapter.writes[0].options, { merge: true });
    assert.ok(!ctx.adapter.writes.some((w) => w.path === 'users/uid1' || (w.op === 'delete' && !w.path.includes('/fcmTokens/'))));
    assert.deepEqual(ctx.storage.data, {});
    assert.equal(ctx.el('enable').shown, true);
});

test('A5: a failed settings write keeps the flags and the UI on with an error, so the reader can retry; every other step is still tried', async () => {
    const ctx = setup({
        adapter: fakeAdapter({ permission: () => 'granted', deleteToken: () => Promise.reject(new Error('x')) }),
        storage: fakeStorage(OPTED),
    });
    ctx.adapter.db.set = () => Promise.reject(new Error('offline'));
    ctx.adapter.db.delete = () => Promise.reject(new Error('offline'));
    await ctx.run();
    ctx.adapter.log.length = 0;
    await ctx.tap('disable');
    assert.ok(ctx.adapter.log.includes('deleteToken'));
    assert.equal(ctx.storage.data['devotionalPush.optedIn'], '1');
    assert.equal(ctx.storage.data['devotionalPush.token'], 'tok1');
    assert.equal(ctx.el('disable').shown, true);
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assert.equal(ctx.el('disable').disabled, false);
});

test('A5: disable with no signed-in user skips Firestore but still deletes the token and clears the flags', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted', currentUid: () => Promise.resolve(null) }), storage: fakeStorage(OPTED) });
    await ctx.run();
    ctx.adapter.writes.length = 0;
    ctx.adapter.log.length = 0;
    await ctx.tap('disable');
    assert.deepEqual(ctx.adapter.writes, []);
    assert.ok(ctx.adapter.log.includes('deleteToken'));
    assert.deepEqual(ctx.storage.data, {});
});

test('hour change while opted in writes only the settings document with the new hour', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    await ctx.run();
    ctx.adapter.writes.length = 0;
    ctx.el('hour').value = '21';
    ctx.el('hour').listeners.change();
    await tick();
    assert.deepEqual(ctx.adapter.writes.map((w) => w.path), ['users/uid1/settings/notifications']);
    assert.equal(ctx.adapter.writes[0].data.notificationTime, '21:00');
    assert.equal(ctx.adapter.writes[0].data.notificationsEnabled, true);
    assert.equal(ctx.storage.data['devotionalPush.hour'], '21');
});

test('hour change before opting in only remembers the choice', async () => {
    const ctx = setup();
    await ctx.run();
    ctx.el('hour').value = '5';
    ctx.el('hour').listeners.change();
    await tick();
    assert.deepEqual(ctx.adapter.log, []);
    assert.equal(ctx.storage.data['devotionalPush.hour'], '5');
});

test('hour change while busy is ignored and the select returns to the stored hour', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = setup({ adapter: fakeAdapter({ getToken: () => gate.then(() => 'tok1') }), storage: fakeStorage({ 'devotionalPush.hour': '8' }) });
    await ctx.run();
    ctx.el('enable').listeners.click();
    await tick();
    ctx.el('hour').value = '12';
    ctx.el('hour').listeners.change();
    assert.equal(ctx.el('hour').value, '8');
    release();
    await tick();
    assert.equal(ctx.adapter.writes[2].data.notificationTime, '08:00');
});

test('hour change failure shows the error text and does not throw', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    await ctx.run();
    ctx.adapter.db.set = () => Promise.reject(new Error('offline'));
    ctx.el('hour').value = '3';
    ctx.el('hour').listeners.change();
    await tick();
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
});

test('init never throws: missing adapter, throwing storage, missing DOM or throwing permission', async () => {
    await assert.doesNotReject(init(fakeDoc(), fakeWin(), CONFIG, {}));
    await assert.doesNotReject(init(fakeDoc(), fakeWin(), CONFIG, undefined));
    await assert.doesNotReject(init({ querySelector: () => null }, fakeWin(), CONFIG, { adapter: fakeAdapter(), t }));
    const boom = () => { throw new Error('storage'); };
    await assert.doesNotReject(init(fakeDoc(), fakeWin(), CONFIG, { adapter: fakeAdapter(), storage: { get: boom, set: boom, remove: boom }, t }));
    await assert.doesNotReject(init(fakeDoc(), fakeWin(), CONFIG, { adapter: fakeAdapter({ permission: () => { throw new Error('p'); } }), t }));
});

test('init without the HTML container still runs the kill switch flow', async () => {
    const ctx = setup({ config: { enabled: true, pushEnabled: false }, storage: fakeStorage(OPTED), doc: { querySelector: () => null } });
    await ctx.run();
    assert.ok(ctx.adapter.log.includes('deleteToken'));
});

test('default storage wraps localStorage and survives it throwing', async () => {
    const win = fakeWin();
    win.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    await assert.doesNotReject(init(fakeDoc(), win, CONFIG, { adapter: fakeAdapter(), t }));
});

test('default storage reads the opted-in flag from localStorage', async () => {
    const win = fakeWin();
    const data = { ...OPTED };
    win.localStorage = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
    const doc = fakeDoc();
    await init(doc, win, CONFIG, { adapter: fakeAdapter({ permission: () => 'granted' }), t });
    assert.equal(doc.els['[data-push-disable]'].shown, true);
});

function fakeI18n(ready = false) {
    const state = { ready, prefix: 'ES:', lang: 'es', readyCallbacks: [], langHandlers: [] };
    state.i18n = {
        t: (key, fallback) => (state.ready ? state.prefix + key : fallback),
        whenReady: (cb) => { if (state.ready) cb(); else state.readyCallbacks.push(cb); },
        onLanguageChanged: (handler) => { state.langHandlers.push(handler); },
        currentLanguage: () => (state.ready ? state.lang : undefined),
    };
    state.becomeReady = () => { state.ready = true; state.readyCallbacks.forEach((cb) => cb()); };
    return state;
}

test('D1: before translations exist the status is empty, never a raw key; it fills in once ready and follows language switches', async () => {
    const fake = fakeI18n();
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    delete ctx.deps.t;
    ctx.deps.i18n = fake.i18n;
    await ctx.run();
    assert.equal(ctx.el('status').textContent, '');
    fake.becomeReady();
    assert.equal(ctx.el('status').textContent, 'ES:push.status_enabled');
    fake.prefix = 'EN:';
    fake.langHandlers.forEach((handler) => handler());
    assert.equal(ctx.el('status').textContent, 'EN:push.status_enabled');
});

test('D1: the default translator comes from DevotionalI18n', async () => {
    const fake = fakeI18n(true);
    globals.DevotionalI18n = fake.i18n;
    try {
        const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
        delete ctx.deps.t;
        await ctx.run();
        assert.equal(ctx.el('status').textContent, 'ES:push.status_enabled');
    } finally {
        delete globals.DevotionalI18n;
    }
});

test('FIX1: with a storage that cannot persist the hour, enable and hour change use the hour the select shows', async () => {
    const base = fakeStorage();
    const noHour = { get: (k) => (k === 'devotionalPush.hour' ? null : base.get(k)), set: (k, v) => { if (k !== 'devotionalPush.hour') base.set(k, v); }, remove: base.remove };
    const ctx = setup({ storage: noHour });
    ctx.deps.storage = noHour;
    await ctx.run();
    ctx.el('hour').value = '20';
    await ctx.tap('enable');
    assert.equal(ctx.adapter.writes[2].data.notificationTime, '20:00');
    ctx.adapter.writes.length = 0;
    ctx.el('hour').value = '21';
    ctx.el('hour').listeners.change();
    await tick();
    assert.equal(ctx.adapter.writes[0].data.notificationTime, '21:00');
});

test('FIX2: a successful hour change clears the error left by an earlier failed one', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    await ctx.run();
    const realSet = ctx.adapter.db.set;
    ctx.adapter.db.set = () => Promise.reject(new Error('offline'));
    ctx.el('hour').value = '3';
    ctx.el('hour').listeners.change();
    await tick();
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    ctx.adapter.db.set = realSet;
    ctx.el('hour').value = '4';
    ctx.el('hour').listeners.change();
    await tick();
    assert.equal(ctx.el('status').textContent, 'T:push.status_enabled');
});

test('kill switch or revoked permission with a failed settings write keeps the flag for the next visit', async () => {
    for (const make of [
        () => setup({ config: { enabled: true, pushEnabled: false }, storage: fakeStorage(OPTED) }),
        () => setup({ adapter: fakeAdapter({ permission: () => 'denied' }), storage: fakeStorage(OPTED) }),
    ]) {
        const ctx = make();
        ctx.adapter.db.set = () => Promise.reject(new Error('offline'));
        await ctx.run();
        assert.equal(ctx.storage.data['devotionalPush.optedIn'], '1');
    }
});

test('ITEM3: when the opted-in flag does not persist, enable undoes the server writes and shows an error', async () => {
    const noop = { get: () => null, set: () => {}, remove: () => {} };
    const ctx = setup({ storage: noop });
    ctx.deps.storage = noop;
    await ctx.run();
    await ctx.tap('enable');
    assert.deepEqual(ctx.adapter.log.slice(-3), ['set users/uid1/settings/notifications', 'delete users/uid1/fcmTokens/tok1', 'deleteToken']);
    assert.equal(ctx.adapter.writes.find((w) => w.path.endsWith('/settings/notifications') && w.data.notificationsEnabled === false) !== undefined, true);
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assert.equal(ctx.el('enable').shown, true);
});

test('LANG: an opted-in entry waits for i18n before the writes and then writes the language', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    ctx.i18nState.ready = false;
    const running = ctx.run();
    await tick();
    assert.deepEqual(ctx.adapter.writes, []);
    ctx.i18nState.becomeReady();
    await running;
    assert.equal(ctx.adapter.writes[2].data.preferredLanguage, 'es');
});

test('LANG: the wait is bounded: a never-ready i18n still lets the entry write, without a language', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    ctx.i18nState.ready = false;
    await ctx.run();
    assert.equal(ctx.adapter.writes.length, 3);
    assert.equal('preferredLanguage' in ctx.adapter.writes[2].data, false);
});

test('LANG: a language change while opted in rewrites the settings with the new language; ignored while busy', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    await ctx.run();
    ctx.adapter.writes.length = 0;
    ctx.i18nState.lang = 'en';
    ctx.i18nState.langHandlers.forEach((h) => h());
    await tick();
    assert.deepEqual(ctx.adapter.writes.map((w) => w.path), ['users/uid1/settings/notifications']);
    assert.equal(ctx.adapter.writes[0].data.preferredLanguage, 'en');
});

test('LANG: a language change before opting in writes nothing', async () => {
    const ctx = setup();
    await ctx.run();
    ctx.i18nState.langHandlers.forEach((h) => h());
    await tick();
    assert.deepEqual(ctx.adapter.log, []);
});

// Surface gate: pushEnabled && isStandalone && !isAndroid. Browser tabs and Android never write.
const SDK_CALLS = ['requestPermission', 'load', 'signInAnonymously', 'registration', 'getToken', 'currentUid', 'deleteToken'];
function assertUntouched(ctx, stored) {
    assert.deepEqual(ctx.adapter.log, []);
    assert.deepEqual(ctx.adapter.writes, []);
    for (const call of SDK_CALLS) assert.ok(!ctx.adapter.log.includes(call));
    assert.deepEqual(ctx.storage.data, stored);
}

test('gate 1a: iOS Safari browser tab with pushEnabled shows the install hint, no toggle, nothing touched', async () => {
    const ctx = setup({ win: fakeWin({ ua: UA.iphone, standalone: false }) });
    await ctx.run();
    assert.equal(ctx.el('').shown, true);
    assert.equal(ctx.el('status').textContent, 'T:push.status_ios_install');
    for (const name of ['enable', 'disable', 'hour']) assert.equal(ctx.el(name).shown, false);
    assertUntouched(ctx, {});
});

test('gate 1b: desktop browser tab with pushEnabled hides the section: no hint, no toggle, nothing touched', async () => {
    const ctx = setup({ win: fakeWin({ standalone: false }) });
    await ctx.run();
    assert.equal(ctx.el('').shown, false);
    for (const name of ['enable', 'disable']) assert.equal(ctx.el(name).shown, false);
    assert.notEqual(ctx.el('status').textContent, 'T:push.status_ios_install');
    assertUntouched(ctx, {});
});

test('gate 2: browser tab with a stale opted-in flag, pushEnabled true or false: no writes, no unsubscribe, no prompt', async () => {
    for (const pushEnabled of [true, false]) {
        for (const ua of [UA.desktop, UA.iphone]) {
            const ctx = setup({ win: fakeWin({ ua, standalone: false }), storage: fakeStorage(OPTED), config: { enabled: true, pushEnabled } });
            await ctx.run();
            await tick();
            assertUntouched(ctx, OPTED);
            assert.equal(ctx.el('enable').shown, false);
            assert.equal(ctx.el('disable').shown, false);
        }
    }
});

test('gate 2b: installed app opted in with pushEnabled false still unsubscribes (kill switch kept), iOS and desktop', async () => {
    const wins = {
        ios: fakeWin({ ua: UA.iphone, standalone: true }),
        desktop: (() => { const w = fakeWin({ standalone: false }); w.matchMedia = () => ({ matches: true }); return w; })(),
    };
    for (const [name, win] of Object.entries(wins)) {
        const ctx = setup({ win, config: { enabled: true, pushEnabled: false }, storage: fakeStorage(OPTED) });
        await ctx.run();
        assert.equal(ctx.el('').shown, false, name);
        assert.deepEqual(ctx.adapter.log, ['load', 'currentUid', 'set users/uid1/settings/notifications', 'delete users/uid1/fcmTokens/tok1', 'deleteToken'], name);
        assert.equal(ctx.storage.data['devotionalPush.optedIn'], undefined, name);
    }
});

test('gate 3: iOS home-screen app (navigator.standalone true, matchMedia false) shows push', async () => {
    const ctx = setup({ win: fakeWin({ ua: UA.iphone, standalone: true }) });
    await ctx.run();
    assert.equal(ctx.el('').shown, true);
    assert.equal(ctx.el('enable').shown, true);
});

test('gate 4: Android standalone hides push', async () => {
    const ctx = setup({ win: fakeWin({ ua: UA.android, standalone: true }) });
    await ctx.run();
    assert.equal(ctx.el('').shown, false);
    assert.equal(ctx.el('enable').shown, false);
    assertUntouched(ctx, {});
});

test('gate 4b: Android standalone with a stale opted-in flag, pushEnabled true or false: hidden, no writes, no disable flow', async () => {
    for (const pushEnabled of [true, false]) {
        const ctx = setup({ win: fakeWin({ ua: UA.android, standalone: true }), storage: fakeStorage(OPTED), config: { enabled: true, pushEnabled } });
        await ctx.run();
        await tick();
        assert.equal(ctx.el('').shown, false);
        assertUntouched(ctx, OPTED);
    }
});

test('gate: a missing DevotionalStandalone.isAndroid is treated as not Android and never throws', async () => {
    const standalone = globals.DevotionalStandalone;
    globals.DevotionalStandalone = { isStandalone: standalone.isStandalone };
    try {
        const ctx = setup({ win: fakeWin({ ua: UA.android, standalone: true }) });
        await ctx.run();
        assert.equal(ctx.el('enable').shown, true);
    } finally {
        globals.DevotionalStandalone = standalone;
    }
});

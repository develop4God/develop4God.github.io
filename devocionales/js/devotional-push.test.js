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
loadInto(globals, 'devotional-push-help.js');
loadInto(globals, 'devotional-push-offer.js');
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
        attrs: {},
        setAttribute(name, value) { this.attrs[name] = String(value); },
        getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
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
        '[data-push-switch-row]': fakeEl(),
        '[data-push-switch]': fakeEl(false),
        '[data-push-time-row]': fakeEl(),
        '[data-push-time-value]': fakeEl(false),
        '[data-push-hour]': Object.assign(fakeEl(false), { options: [] }),
        '[data-push-status]': fakeEl(false),
        '[data-push-offer]': fakeEl(),
        '[data-push-offer-enable]': fakeEl(false),
        '[data-push-offer-later]': fakeEl(false),
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
    ctx.win.document = ctx.doc;
    ctx.tap = async (name) => { ctx.el(name).listeners.click(); await flush(); };
    // The switch row is what the reader sees: on = notifications are on (opted in), off = one tap away.
    ctx.on = () => ctx.el('switch').getAttribute('aria-checked') === 'true';
    return ctx;
}

const assertOff = (ctx) => { assert.equal(ctx.el('switch-row').shown, true); assert.equal(ctx.on(), false); };
const assertOn = (ctx) => { assert.equal(ctx.el('switch-row').shown, true); assert.equal(ctx.on(), true); };

const flush = () => new Promise((resolve) => setImmediate(resolve));
const tick = async () => { for (let i = 0; i < 20; i += 1) await flush(); };

test('A1: init for a new reader shows the enable button; no prompt, no SDK, no Firebase call', async () => {
    const ctx = setup();
    await ctx.run();
    assert.equal(ctx.el('').shown, true);
    assertOff(ctx);
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
    for (const name of ['switch-row', 'time-row']) assert.equal(ctx.el(name).shown, false);
    assert.deepEqual(ctx.adapter.log, []);
});

test('A2: iOS installed (standalone) gets the normal enable button', async () => {
    const ctx = setup({ win: fakeWin({ ua: UA.iphone, standalone: true }) });
    await ctx.run();
    assertOff(ctx);
    assert.notEqual(ctx.el('status').textContent, 'T:push.status_ios_install');
});

test('A3: denied or dismissed permission shows the denied text and calls no Firebase', async () => {
    for (const answer of ['denied', 'default']) {
        const ctx = setup({ adapter: fakeAdapter({ requestPermission: () => Promise.resolve(answer) }) });
        await ctx.run();
        await ctx.tap('switch');
        assert.equal(ctx.el('status').textContent, answer === 'denied' ? 'T:push.blocked_desktop' : 'T:push.status_denied');
        assert.deepEqual(ctx.adapter.log, ['requestPermission']);
        assert.deepEqual(ctx.storage.data, {});
        assertOff(ctx);
    }
});

test('enable: permission is requested synchronously inside the click, before any await', async () => {
    const ctx = setup();
    await ctx.run();
    ctx.el('switch').listeners.click();
    assert.deepEqual(ctx.adapter.log, ['requestPermission']);
    await flush();
});

test('enable: a rejecting requestPermission shows the error and leaves the button usable', async () => {
    const ctx = setup({ adapter: fakeAdapter({ requestPermission: () => Promise.reject(new Error('x')) }) });
    await ctx.run();
    await ctx.tap('switch');
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assert.equal(ctx.el('switch').disabled, false);
});

test('enable: happy path in the app write order, with the raw token, hour, timezone and language', async () => {
    const ctx = setup({ storage: fakeStorage({ 'devotionalPush.hour': '7' }) });
    await ctx.run();
    await ctx.tap('switch');
    assert.deepEqual(ctx.adapter.log, ['requestPermission', 'load', 'signInAnonymously', 'registration', 'getToken', ...WRITES]);
    const settings = ctx.adapter.writes[2].data;
    assert.equal(settings.notificationsEnabled, true);
    assert.equal(settings.notificationTime, '07:00');
    assert.equal(settings.preferredLanguage, 'es');
    assert.equal(settings.userTimezone, Intl.DateTimeFormat().resolvedOptions().timeZone);
    assert.equal(ctx.adapter.writes[1].data.token, 'tok1');
    assert.equal(ctx.storage.data['devotionalPush.optedIn'], '1');
    assert.equal(ctx.storage.data['devotionalPush.token'], 'tok1');
    assertOn(ctx);
    assert.equal(ctx.el('status').textContent, 'T:push.status_enabled');
});

test('enable: the language is omitted until i18n has finished loading', async () => {
    const ctx = setup();
    ctx.i18nState.ready = false;
    await ctx.run();
    await ctx.tap('switch');
    assert.equal('preferredLanguage' in ctx.adapter.writes[2].data, false);
});

test('enable: no service worker registration (null) is an error and writes nothing', async () => {
    const ctx = setup({ adapter: fakeAdapter({ registration: () => Promise.resolve(null) }) });
    await ctx.run();
    await ctx.tap('switch');
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assert.deepEqual(ctx.adapter.writes, []);
    assert.deepEqual(ctx.storage.data, {});
    assert.equal(ctx.el('switch').disabled, false);
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
        await ctx.tap('switch');
        assert.equal(ctx.el('status').textContent, 'T:push.status_error');
        assert.equal(ctx.storage.data['devotionalPush.optedIn'], undefined);
        assert.equal(ctx.el('switch').disabled, false);
        assertOff(ctx);
    }
    const ctx = setup();
    ctx.adapter.db.set = () => Promise.reject(new Error('rules'));
    await ctx.run();
    await ctx.tap('switch');
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assert.equal(ctx.storage.data['devotionalPush.optedIn'], undefined);
});

test('enable: a double tap while busy is ignored and the button is disabled meanwhile', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = setup({ adapter: fakeAdapter({ getToken: () => gate.then(() => 'tok1') }) });
    await ctx.run();
    ctx.el('switch').listeners.click();
    await tick();
    assert.equal(ctx.el('switch').disabled, true);
    ctx.el('switch').listeners.click();
    await tick();
    assert.equal(ctx.adapter.log.filter((c) => c === 'requestPermission').length, 1);
    release();
    await tick();
    assert.equal(ctx.adapter.writes.length, 3);
    assert.equal(ctx.el('switch').disabled, false);
});

test('opted in and granted: every entry does the three writes in order with no reads and no prompt', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '6' }) });
    await ctx.run();
    assert.deepEqual(ctx.adapter.log, ['load', 'currentUid', 'registration', 'getToken', ...WRITES]);
    assert.equal(ctx.adapter.writes[2].data.notificationTime, '06:00');
    assert.equal('lastNotificationSentDate' in ctx.adapter.writes[2].data, false);
    assertOn(ctx);
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
    assert.equal(ctx.el('switch').disabled, false);
});

test('A4: permission revoked while opted in runs the disable flow and shows the enable button', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'denied' }), storage: fakeStorage(OPTED) });
    await ctx.run();
    assert.deepEqual(ctx.adapter.log, ['load', 'currentUid', 'set users/uid1/settings/notifications', 'delete users/uid1/fcmTokens/tok1', 'deleteToken']);
    assertOff(ctx);
    assert.equal(ctx.storage.data['devotionalPush.optedIn'], undefined);
});

test('A5: disable tap writes notificationsEnabled false, removes this token, deletes it and clears the flags', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    await ctx.run();
    ctx.adapter.log.length = 0;
    ctx.adapter.writes.length = 0;
    await ctx.tap('switch');
    assert.deepEqual(ctx.adapter.log, ['load', 'currentUid', 'set users/uid1/settings/notifications', 'delete users/uid1/fcmTokens/tok1', 'deleteToken']);
    assert.deepEqual(Object.keys(ctx.adapter.writes[0].data).sort(), ['lastUpdated', 'notificationsEnabled']);
    assert.deepEqual(ctx.adapter.writes[0].options, { merge: true });
    assert.ok(!ctx.adapter.writes.some((w) => w.path === 'users/uid1' || (w.op === 'delete' && !w.path.includes('/fcmTokens/'))));
    assert.deepEqual(ctx.storage.data, {});
    assertOff(ctx);
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
    await ctx.tap('switch');
    assert.ok(ctx.adapter.log.includes('deleteToken'));
    assert.equal(ctx.storage.data['devotionalPush.optedIn'], '1');
    assert.equal(ctx.storage.data['devotionalPush.token'], 'tok1');
    assertOn(ctx);
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assert.equal(ctx.el('switch').disabled, false);
});

test('A5: disable with no signed-in user skips Firestore but still deletes the token and clears the flags', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted', currentUid: () => Promise.resolve(null) }), storage: fakeStorage(OPTED) });
    await ctx.run();
    ctx.adapter.writes.length = 0;
    ctx.adapter.log.length = 0;
    await ctx.tap('switch');
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

test('hour change while the switch is off (the row is disabled, so this is only a guard) is ignored and the row stays on the saved hour', async () => {
    const ctx = setup();
    await ctx.run();
    ctx.el('hour').value = '5';
    ctx.el('hour').listeners.change();
    await tick();
    assert.deepEqual(ctx.adapter.log, []);
    assert.equal(ctx.el('hour').value, '9');
    assert.equal(ctx.el('time-value').textContent, '09:00');
    assert.equal(ctx.storage.data['devotionalPush.hour'], undefined);
});

test('hour change while busy is ignored and the select returns to the stored hour', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = setup({ adapter: fakeAdapter({ getToken: () => gate.then(() => 'tok1') }), storage: fakeStorage({ 'devotionalPush.hour': '8' }) });
    await ctx.run();
    ctx.el('switch').listeners.click();
    await tick();
    ctx.el('hour').value = '12';
    ctx.el('hour').listeners.change();
    assert.equal(ctx.el('hour').value, '8');
    release();
    await tick();
    assert.equal(ctx.adapter.writes[2].data.notificationTime, '08:00');
});

test('hour change failure reverts the row to the last saved hour, shows the time error and does not throw', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '14' }) });
    await ctx.run();
    ctx.adapter.db.set = () => Promise.reject(new Error('offline'));
    ctx.el('hour').value = '3';
    ctx.el('hour').listeners.change();
    await tick();
    assert.equal(ctx.el('status').textContent, 'T:push.time_error');
    assert.equal(ctx.el('hour').value, '14');
    assert.equal(ctx.el('time-value').textContent, '14:00');
    assert.equal(ctx.storage.data['devotionalPush.hour'], '14');
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
    assert.equal(doc.els['[data-push-switch]'].getAttribute('aria-checked'), 'true');
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
    await ctx.tap('switch');
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
    assert.equal(ctx.el('status').textContent, 'T:push.time_error');
    ctx.adapter.db.set = realSet;
    ctx.el('hour').value = '4';
    ctx.el('hour').listeners.change();
    await tick();
    assert.equal(ctx.el('status').textContent, 'T:push.time_set 04:00');
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
    await ctx.tap('switch');
    assert.deepEqual(ctx.adapter.log.slice(-3), ['set users/uid1/settings/notifications', 'delete users/uid1/fcmTokens/tok1', 'deleteToken']);
    assert.equal(ctx.adapter.writes.find((w) => w.path.endsWith('/settings/notifications') && w.data.notificationsEnabled === false) !== undefined, true);
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assertOff(ctx);
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

test('RACE: a second hour pick while a save runs is shown, then saved after it; the stored, shown and written hours agree', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '9' }) });
    await ctx.run();
    ctx.adapter.writes.length = 0;
    ctx.adapter.load = () => gate;
    ctx.el('hour').value = '12';
    ctx.el('hour').listeners.change();
    await tick();
    ctx.el('hour').value = '15';
    ctx.el('hour').listeners.change();
    ctx.adapter.load = () => Promise.resolve();
    release();
    await tick();
    assert.deepEqual(ctx.adapter.writes.map((w) => w.data.notificationTime), ['12:00', '15:00']);
    assert.equal(ctx.storage.data['devotionalPush.hour'], '15');
    assert.equal(ctx.el('hour').value, '15');
    assert.equal(ctx.el('time-value').textContent, '15:00');
});

test('RACE: the running save writes the hour that was chosen, not what the picker shows at that moment', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '9' }) });
    await ctx.run();
    ctx.adapter.writes.length = 0;
    ctx.adapter.load = () => gate;
    ctx.el('hour').value = '12';
    ctx.el('hour').listeners.change();
    await tick();
    ctx.el('hour').value = '15';
    ctx.el('hour').listeners.change();
    ctx.adapter.load = () => Promise.resolve();
    ctx.adapter.db.set = (p, data) => { ctx.adapter.writes.push({ path: p, data }); return Promise.resolve(); };
    release();
    await tick();
    assert.equal(ctx.adapter.writes[0].data.notificationTime, '12:00');
});

test('RACE: a pick made while the switch is being turned off is dropped and the row returns to the saved hour', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '9' }) });
    await ctx.run();
    ctx.adapter.writes.length = 0;
    ctx.adapter.load = () => gate;
    ctx.el('switch').listeners.click();
    await tick();
    ctx.el('hour').value = '15';
    ctx.el('hour').listeners.change();
    ctx.adapter.load = () => Promise.resolve();
    release();
    await tick();
    assert.equal(ctx.el('hour').value, '9');
    assert.ok(!ctx.adapter.writes.some((w) => w.data && w.data.notificationTime));
});

test('LANG-BUSY: a language change while a save is in flight is written once the flow ends', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '9' }) });
    await ctx.run();
    ctx.adapter.writes.length = 0;
    const realSet = ctx.adapter.db.set;
    ctx.adapter.db.set = (...args) => { ctx.adapter.db.set = realSet; return gate.then(() => realSet(...args)); };
    ctx.el('hour').value = '12';
    ctx.el('hour').listeners.change();
    await tick();
    ctx.i18nState.lang = 'en';
    ctx.i18nState.langHandlers.forEach((h) => h());
    release();
    await tick();
    const last = ctx.adapter.writes[ctx.adapter.writes.length - 1];
    assert.equal(last.data.preferredLanguage, 'en');
    assert.equal(last.data.notificationTime, '12:00');
});

test('LANG-BUSY: several language changes while busy cause one rewrite; none when notifications ended up off', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    await ctx.run();
    ctx.adapter.writes.length = 0;
    ctx.adapter.load = () => gate;
    ctx.el('switch').listeners.click();
    await tick();
    ctx.i18nState.lang = 'en';
    ctx.i18nState.langHandlers.forEach((h) => h());
    ctx.i18nState.langHandlers.forEach((h) => h());
    ctx.adapter.load = () => Promise.resolve();
    release();
    await tick();
    assert.equal(ctx.adapter.writes.filter((w) => w.data && w.data.preferredLanguage).length, 0);
    assertOff(ctx);
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
    for (const name of ['switch-row', 'time-row']) assert.equal(ctx.el(name).shown, false);
    assertUntouched(ctx, {});
});

test('gate 1b: desktop browser tab with pushEnabled hides the section: no hint, no toggle, nothing touched', async () => {
    const ctx = setup({ win: fakeWin({ standalone: false }) });
    await ctx.run();
    assert.equal(ctx.el('').shown, false);
    assert.equal(ctx.el('switch-row').shown, false);
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
            assert.equal(ctx.el('switch-row').shown, false);
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
    assertOff(ctx);
});

test('gate 4: Android standalone hides push', async () => {
    const ctx = setup({ win: fakeWin({ ua: UA.android, standalone: true }) });
    await ctx.run();
    assert.equal(ctx.el('').shown, false);
    assert.equal(ctx.el('switch-row').shown, false);
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

// An unknown surface (helper missing or broken, e.g. an old cached standalone script) is NOT the
// app: hiding is the safe side, since an installed Android PWA must never see push.
async function assertHiddenWithStandalone(replacement) {
    const standalone = globals.DevotionalStandalone;
    globals.DevotionalStandalone = replacement;
    try {
        for (const ua of [UA.android, UA.desktop]) {
            const ctx = setup({ win: fakeWin({ ua, standalone: true }), storage: fakeStorage(OPTED), config: { enabled: true, pushEnabled: false } });
            await ctx.run();
            await tick();
            assert.equal(ctx.el('').shown, false);
            assertUntouched(ctx, OPTED);
        }
    } finally {
        globals.DevotionalStandalone = standalone;
    }
}

test('gate: a missing or non-function isAndroid is an unknown surface: hidden, nothing touched, no throw', async () => {
    const { isStandalone } = globals.DevotionalStandalone;
    await assertHiddenWithStandalone({ isStandalone });
    await assertHiddenWithStandalone({ isStandalone, isAndroid: 'nope' });
});

test('gate: DevotionalStandalone absent entirely: hidden, nothing touched, no throw', async () => {
    await assertHiddenWithStandalone(undefined);
});

test('gate: isStandalone not a function: hidden, nothing touched, no throw', async () => {
    await assertHiddenWithStandalone({ isAndroid: () => false });
    await assertHiddenWithStandalone({ isStandalone: true, isAndroid: () => false });
});

// ---- Settings screen: one switch and one time row (replaces the enable/disable buttons) ----

test('S1: the default hour is 09:00, as in the Flutter app', async () => {
    const ctx = setup();
    await ctx.run();
    assert.equal(ctx.el('hour').value, '9');
    assert.equal(ctx.el('time-value').textContent, '09:00');
    await ctx.tap('switch');
    assert.equal(ctx.adapter.writes[2].data.notificationTime, '09:00');
});

test('S2: the switch starts off, and the time row is disabled until notifications are on', async () => {
    const ctx = setup();
    await ctx.run();
    assertOff(ctx);
    assert.equal(ctx.el('hour').disabled, true);
    assert.deepEqual(ctx.adapter.log, []);
});

test('S3: tapping the switch while off runs the enable flow and turns it on; the time row opens up', async () => {
    const ctx = setup();
    await ctx.run();
    await ctx.tap('switch');
    assert.deepEqual(ctx.adapter.log.slice(0, 1), ['requestPermission']);
    assertOn(ctx);
    assert.equal(ctx.el('hour').disabled, false);
});

test('S4: tapping the switch while on runs the disable flow, clears the opt-in and greys the time row again', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage(OPTED) });
    await ctx.run();
    assertOn(ctx);
    await ctx.tap('switch');
    assertOff(ctx);
    assert.equal(ctx.el('hour').disabled, true);
    assert.deepEqual(ctx.storage.data, {});
    assert.ok(ctx.adapter.log.includes('deleteToken'));
});

test('S5: denied permission leaves the switch off with the blocked message', async () => {
    const ctx = setup({ adapter: fakeAdapter({ requestPermission: () => Promise.resolve('denied') }) });
    await ctx.run();
    await ctx.tap('switch');
    assertOff(ctx);
    assert.equal(ctx.el('status').textContent, 'T:push.blocked_desktop');
    assert.equal(ctx.el('hour').disabled, true);
});

test('S6: the switch is disabled while a flow runs, so a second tap is ignored', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const ctx = setup({ adapter: fakeAdapter({ getToken: () => gate.then(() => 'tok1') }) });
    await ctx.run();
    ctx.el('switch').listeners.click();
    await tick();
    assert.equal(ctx.el('switch').disabled, true);
    ctx.el('switch').listeners.click();
    release();
    await tick();
    assert.equal(ctx.adapter.log.filter((entry) => entry === 'requestPermission').length, 1);
    assert.equal(ctx.el('switch').disabled, false);
    assertOn(ctx);
});

test('S7: picking a new hour while on writes once, shows the new hour and the confirmation text', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '9' }) });
    await ctx.run();
    ctx.adapter.writes.length = 0;
    ctx.el('hour').value = '18';
    ctx.el('hour').listeners.change();
    await tick();
    assert.equal(ctx.adapter.writes.length, 1);
    assert.equal(ctx.adapter.writes[0].data.notificationTime, '18:00');
    assert.equal(ctx.el('time-value').textContent, '18:00');
    assert.equal(ctx.el('status').textContent, 'T:push.time_set 18:00');
    assert.equal(ctx.storage.data['devotionalPush.hour'], '18');
});

test('S8: picking the same hour again writes nothing and says nothing', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '9' }) });
    await ctx.run();
    await tick();
    ctx.adapter.writes.length = 0;
    const before = ctx.el('status').textContent;
    ctx.el('hour').value = '9';
    ctx.el('hour').listeners.change();
    await tick();
    assert.deepEqual(ctx.adapter.writes, []);
    assert.equal(ctx.el('status').textContent, before);
});

test('S9: a failed save followed by the same pick retries the save (the failed hour was not remembered)', async () => {
    const ctx = setup({ adapter: fakeAdapter({ permission: () => 'granted' }), storage: fakeStorage({ ...OPTED, 'devotionalPush.hour': '9' }) });
    await ctx.run();
    const realSet = ctx.adapter.db.set;
    ctx.adapter.db.set = () => Promise.reject(new Error('offline'));
    ctx.el('hour').value = '12';
    ctx.el('hour').listeners.change();
    await tick();
    ctx.adapter.db.set = realSet;
    ctx.adapter.writes.length = 0;
    ctx.el('hour').value = '12';
    ctx.el('hour').listeners.change();
    await tick();
    assert.equal(ctx.adapter.writes[0].data.notificationTime, '12:00');
    assert.equal(ctx.el('status').textContent, 'T:push.time_set 12:00');
});

test('S10: the time row shows the stored hour on entry, and the status line carries only a message after a change', async () => {
    const ctx = setup({ storage: fakeStorage({ 'devotionalPush.hour': '19' }) });
    await ctx.run();
    assert.equal(ctx.el('time-value').textContent, '19:00');
    assert.equal(ctx.el('status').textContent, '');
});

test('S11: older markup without the switch or the time row (an earlier cached page) does not make init throw', async () => {
    const doc = fakeDoc();
    doc.els['[data-push-switch]'] = null;
    doc.els['[data-push-switch-row]'] = null;
    doc.els['[data-push-time-row]'] = null;
    doc.els['[data-push-time-value]'] = null;
    const ctx = setup({ doc });
    await assert.doesNotReject(ctx.run());
    assert.equal(ctx.el('').shown, true);
});

// ---- First-launch offer card and blocked-state help ----

const offerCard = (ctx) => ctx.doc.els['[data-push-offer]'];
const tapOffer = async (ctx, which) => { ctx.doc.els[`[data-push-offer-${which}]`].listeners.click(); await flush(); };
const DISMISSED = { 'devotionalPush.offerDismissed': '1' };

// A fake document that also records visibilitychange handlers and the visibility state.
function withVisibility(ctx) {
    const handlers = [];
    ctx.doc.visibilityState = 'visible';
    ctx.doc.addEventListener = (type, handler) => { if (type === 'visibilitychange') handlers.push(handler); };
    ctx.becomeVisible = async (state = 'visible') => { ctx.doc.visibilityState = state; handlers.forEach((h) => h()); await flush(); };
    return ctx;
}

test('O1: the offer shows only when every condition holds', async () => {
    const ctx = setup();
    await ctx.run();
    assert.equal(offerCard(ctx).shown, true);
});

test('O1: each single missing condition hides the offer', async () => {
    const cases = {
        'opted in': { storage: fakeStorage(OPTED), adapter: fakeAdapter({ permission: () => 'granted' }) },
        'permission granted': { adapter: fakeAdapter({ permission: () => 'granted' }) },
        'permission denied': { adapter: fakeAdapter({ permission: () => 'denied' }) },
        'unsupported': { adapter: fakeAdapter({ supported: () => false }) },
        'dismissed': { storage: fakeStorage(DISMISSED) },
        'flag off': { config: { enabled: true, pushEnabled: false } },
        'browser tab': { win: fakeWin({ standalone: false, i18nLang: 'es' }) },
        'android app': { win: fakeWin({ ua: UA.android, standalone: true, i18nLang: 'es' }) },
    };
    for (const [name, options] of Object.entries(cases)) {
        const ctx = setup(options);
        await ctx.run();
        assert.equal(offerCard(ctx).shown, false, name);
    }
});

test('O2: Enable on the card runs the same flow: permission first, then the three writes; card hides, switch is on', async () => {
    const ctx = setup();
    await ctx.run();
    await tapOffer(ctx, 'enable');
    assert.deepEqual(ctx.adapter.log.slice(0, 1), ['requestPermission']);
    assert.deepEqual(ctx.adapter.writes.map((w) => `${w.op} ${w.path}`), WRITES);
    assert.equal(offerCard(ctx).shown, false);
    assert.equal(ctx.on(), true);
    assert.equal(ctx.storage.data['devotionalPush.offerDismissed'], undefined);
});

test('O2: the card is gone and the permission request is the first await inside the tap', async () => {
    const order = [];
    const ctx = setup({ adapter: fakeAdapter({ requestPermission: () => { order.push('permission'); return Promise.resolve('granted'); } }) });
    await ctx.run();
    ctx.doc.els['[data-push-offer-enable]'].listeners.click();
    assert.deepEqual(order, ['permission']);
    await flush();
});

test('O3: denied on the card hides it and shows the blocked help in Settings, with no Firebase calls', async () => {
    // Like the browser, the permission reads 'denied' once the reader denied it.
    let permission = 'default';
    const ctx = setup({ adapter: fakeAdapter({ permission: () => permission, requestPermission: () => { permission = 'denied'; return Promise.resolve('denied'); } }) });
    await ctx.run();
    await tapOffer(ctx, 'enable');
    assert.equal(offerCard(ctx).shown, false);
    assert.equal(ctx.el('status').textContent, 'T:push.blocked_desktop');
    assert.deepEqual(ctx.adapter.log, ['requestPermission']);
    assertOff(ctx);
});

test('O3: an error while asking brings the card back afterwards (retry), with the error shown', async () => {
    const ctx = setup({ adapter: fakeAdapter({ requestPermission: () => Promise.reject(new Error('boom')) }) });
    await ctx.run();
    await tapOffer(ctx, 'enable');
    assert.equal(ctx.el('status').textContent, 'T:push.status_error');
    assert.equal(offerCard(ctx).shown, true);
    assert.equal(ctx.storage.data['devotionalPush.offerDismissed'], undefined);
});

test('O3: a dismissed system prompt hides the card while it runs and brings it back, without persisting anything', async () => {
    let answer;
    const ctx = setup({ adapter: fakeAdapter({ requestPermission: () => new Promise((resolve) => { answer = resolve; }) }) });
    await ctx.run();
    ctx.doc.els['[data-push-offer-enable]'].listeners.click();
    assert.equal(offerCard(ctx).shown, false);
    answer('default');
    await flush();
    assert.equal(offerCard(ctx).shown, true);
    assert.equal(ctx.storage.data['devotionalPush.offerDismissed'], undefined);
    assertOff(ctx);
});

test('O3: granted and opted in keeps the card hidden after the flow', async () => {
    const ctx = setup();
    await ctx.run();
    await tapOffer(ctx, 'enable');
    assert.equal(offerCard(ctx).shown, false);
});

test('O4: Not now hides the card, remembers it, writes nothing and does not ask for the permission', async () => {
    const ctx = setup();
    await ctx.run();
    await tapOffer(ctx, 'later');
    assert.equal(offerCard(ctx).shown, false);
    assert.equal(ctx.storage.data['devotionalPush.offerDismissed'], '1');
    assert.deepEqual(ctx.adapter.log, []);
    const next = setup({ storage: ctx.storage });
    await next.run();
    assert.equal(offerCard(next).shown, false);
});

test('O4: a storage that throws does not break Not now', async () => {
    const storage = { get: () => { throw new Error('x'); }, set: () => { throw new Error('x'); }, remove: () => { throw new Error('x'); } };
    const ctx = setup({ storage });
    await ctx.run();
    assert.equal(offerCard(ctx).shown, true);
    await tapOffer(ctx, 'later');
    assert.equal(offerCard(ctx).shown, false);
});

test('O5: the card hides once the reader opts in from the Settings switch', async () => {
    const ctx = setup();
    await ctx.run();
    assert.equal(offerCard(ctx).shown, true);
    await ctx.tap('switch');
    assert.equal(ctx.on(), true);
    assert.equal(offerCard(ctx).shown, false);
});

test('O6: old html (no card elements) with the new script: no error, the switch still works', async () => {
    const ctx = setup();
    for (const key of ['[data-push-offer]', '[data-push-offer-enable]', '[data-push-offer-later]']) delete ctx.doc.els[key];
    await ctx.run();
    await ctx.tap('switch');
    assert.equal(ctx.on(), true);
});

test('H1: permission already denied on load shows the blocked help for the platform; not for default or granted', async () => {
    const iphone = setup({ win: fakeWin({ ua: UA.iphone, standalone: true, i18nLang: 'es' }), adapter: fakeAdapter({ permission: () => 'denied' }) });
    await iphone.run();
    assert.equal(iphone.el('status').textContent, 'T:push.blocked_ios');
    const desktop = setup({ adapter: fakeAdapter({ permission: () => 'denied' }) });
    await desktop.run();
    assert.equal(desktop.el('status').textContent, 'T:push.blocked_desktop');
    for (const permission of ['default', 'granted']) {
        const ctx = setup({ adapter: fakeAdapter({ permission: () => permission }) });
        await ctx.run();
        assert.equal(ctx.el('status').textContent, '');
    }
});

test('H1: a reader who was opted in and revoked the permission sees the help, switched off', async () => {
    const ctx = setup({ storage: fakeStorage(OPTED), adapter: fakeAdapter({ permission: () => 'denied' }) });
    await ctx.run();
    assertOff(ctx);
    assert.equal(ctx.el('status').textContent, 'T:push.blocked_desktop');
});

test('H2: returning to the app after the permission was granted clears the help, and the switch works again', async () => {
    let permission = 'denied';
    const ctx = withVisibility(setup({ adapter: fakeAdapter({ permission: () => permission }) }));
    await ctx.run();
    assert.equal(ctx.el('status').textContent, 'T:push.blocked_desktop');
    permission = 'default';
    await ctx.becomeVisible();
    assert.equal(ctx.el('status').textContent, '');
    await ctx.tap('switch');
    assert.equal(ctx.on(), true);
});

test('H2: the card is evaluated again when the app becomes visible', async () => {
    let permission = 'denied';
    const ctx = withVisibility(setup({ adapter: fakeAdapter({ permission: () => permission }) }));
    await ctx.run();
    assert.equal(offerCard(ctx).shown, false);
    permission = 'default';
    await ctx.becomeVisible();
    assert.equal(offerCard(ctx).shown, true);
});

test('H2: repeated visibility events while denied or while a flow runs do not throw or run a flow', async () => {
    const ctx = withVisibility(setup({ adapter: fakeAdapter({ permission: () => 'denied' }) }));
    await ctx.run();
    await ctx.becomeVisible();
    await ctx.becomeVisible();
    assert.equal(ctx.el('status').textContent, 'T:push.blocked_desktop');
    assert.deepEqual(ctx.adapter.log, []);
});

test('H2: a visibility event leaves other status messages alone when the permission is not denied', async () => {
    const ctx = withVisibility(setup({ storage: fakeStorage(OPTED), adapter: fakeAdapter({ permission: () => 'granted' }) }));
    await ctx.run();
    assert.equal(ctx.el('status').textContent, 'T:push.status_enabled');
    await ctx.becomeVisible();
    assert.equal(ctx.el('status').textContent, 'T:push.status_enabled');
});

test('H2: going to the background changes nothing', async () => {
    let permission = 'denied';
    const ctx = withVisibility(setup({ adapter: fakeAdapter({ permission: () => permission }) }));
    await ctx.run();
    permission = 'default';
    await ctx.becomeVisible('hidden');
    assert.equal(ctx.el('status').textContent, 'T:push.blocked_desktop');
});

test('H3: Android keeps the generic denied text when a denial happens (no platform steps)', async () => {
    // The surface gate stops Android earlier; the key resolver alone must never return text for it.
    assert.equal(globals.DevotionalPushHelp.helpKey({ userAgent: UA.android }), null);
});

test('H4: opted in and the permission is revoked while the app is in the background: the switch goes off, flags are cleared, help shown', async () => {
    let permission = 'granted';
    const ctx = withVisibility(setup({ storage: fakeStorage(OPTED), adapter: fakeAdapter({ permission: () => permission }) }));
    await ctx.run();
    assertOn(ctx);
    permission = 'denied';
    await ctx.becomeVisible();
    assertOff(ctx);
    assert.deepEqual(ctx.storage.data, {});
    assert.equal(ctx.el('status').textContent, 'T:push.blocked_desktop');
});

test('H5: a visibility event while a flow is running does nothing', async () => {
    let answer;
    const ctx = withVisibility(setup({ adapter: fakeAdapter({ permission: () => 'denied', requestPermission: () => new Promise((resolve) => { answer = resolve; }) }) }));
    await ctx.run();
    ctx.el('switch').listeners.click();
    ctx.el('status').textContent = 'sentinel';
    await ctx.becomeVisible();
    assert.equal(ctx.el('status').textContent, 'sentinel');
    answer('denied');
    await flush();
});

test('H6: the generic denied text (prompt dismissed) is not treated as the blocked help and survives a visibility event', async () => {
    const ctx = withVisibility(setup({ adapter: fakeAdapter({ requestPermission: () => Promise.resolve('default') }) }));
    await ctx.run();
    await ctx.tap('switch');
    assert.equal(ctx.el('status').textContent, 'T:push.status_denied');
    await ctx.becomeVisible();
    assert.equal(ctx.el('status').textContent, 'T:push.status_denied');
});

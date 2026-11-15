const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const filename = path.join(__dirname, 'devotional-install.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalInstall;
}

const { init, isAndroid } = loadModule();

function fakeButton() {
    const classes = new Set(['hidden']);
    const listeners = {};
    return {
        listeners,
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            contains: (name) => classes.has(name),
        },
        addEventListener: (type, handler) => { listeners[type] = handler; },
        get shown() { return !classes.has('hidden'); },
    };
}

function fakeWindow(navigator) {
    const listeners = {};
    return {
        listeners,
        navigator,
        addEventListener: (type, handler) => { listeners[type] = handler; },
    };
}

const UA = {
    androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36',
    androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
    linuxDesktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

const doc = (button) => ({
    querySelector: (selector) => (selector === '[data-install]' ? button : null),
    getElementById: () => null,
});

function promptEvent({ rejects = false, outcome = 'accepted' } = {}) {
    const event = {
        defaultPrevented: false,
        prompts: 0,
        preventDefault() { this.defaultPrevented = true; },
        prompt() {
            this.prompts += 1;
            return rejects ? Promise.reject(new Error('refused')) : Promise.resolve();
        },
        userChoice: Promise.resolve({ outcome }),
    };
    return event;
}

test('the install button stays hidden until the browser reports the app is installable', () => {
    const button = fakeButton();
    init(doc(button), fakeWindow());
    assert.equal(button.shown, false);
});

test('beforeinstallprompt is deferred (no mini-infobar) and reveals the button', () => {
    const button = fakeButton();
    const win = fakeWindow();
    init(doc(button), win);
    const event = promptEvent();
    win.listeners.beforeinstallprompt(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(button.shown, true);
});

test('a tap opens the browser prompt; the button stays while it is open and an accepted install hides it', async () => {
    const button = fakeButton();
    const win = fakeWindow();
    init(doc(button), win);
    const event = promptEvent({ outcome: 'accepted' });
    win.listeners.beforeinstallprompt(event);
    const tap = button.listeners.click();
    assert.equal(button.shown, true, 'the button must stay while the prompt is open');
    await tap;
    assert.equal(event.prompts, 1);
    assert.equal(button.shown, false);
    await button.listeners.click();
    assert.equal(event.prompts, 1);
});

test('a dismissed prompt hides the used-up button, and the browser\'s next offer brings it back working', async () => {
    const button = fakeButton();
    const win = fakeWindow();
    init(doc(button), win);
    const dismissed = promptEvent({ outcome: 'dismissed' });
    win.listeners.beforeinstallprompt(dismissed);
    await button.listeners.click();
    assert.equal(button.shown, false, 'a visible button with no usable prompt behind it would be dead');
    await assert.doesNotReject(async () => button.listeners.click());
    assert.equal(dismissed.prompts, 1, 'a prompt event is never used twice');

    const next = promptEvent({ outcome: 'accepted' });
    win.listeners.beforeinstallprompt(next);
    assert.equal(button.shown, true);
    await button.listeners.click();
    assert.equal(next.prompts, 1);
    assert.equal(button.shown, false);
});

test('a tap before any install offer does nothing', async () => {
    const button = fakeButton();
    init(doc(button), fakeWindow());
    await assert.doesNotReject(async () => button.listeners.click());
    assert.equal(button.shown, false);
});

test('a refused prompt does not throw and hides the used-up button until the next offer', async () => {
    const button = fakeButton();
    const win = fakeWindow();
    init(doc(button), win);
    win.listeners.beforeinstallprompt(promptEvent({ rejects: true }));
    await assert.doesNotReject(async () => button.listeners.click());
    assert.equal(button.shown, false);
    win.listeners.beforeinstallprompt(promptEvent());
    assert.equal(button.shown, true);
});

test('appinstalled hides the button', () => {
    const button = fakeButton();
    const win = fakeWindow();
    init(doc(button), win);
    win.listeners.beforeinstallprompt(promptEvent());
    assert.equal(button.shown, true);
    win.listeners.appinstalled();
    assert.equal(button.shown, false);
});

// The native Android app is the offer on Android, so the PWA install button is for everyone else.
for (const [label, ua] of [['phone', UA.androidPhone], ['tablet', UA.androidTablet], ['Firefox', UA.androidFirefox]]) {
    test(`Android ${label}: the button is never shown, and the browser's own banner is still suppressed`, async () => {
        const button = fakeButton();
        const win = fakeWindow({ userAgent: ua });
        init(doc(button), win);
        const event = promptEvent();
        win.listeners.beforeinstallprompt(event);
        assert.equal(event.defaultPrevented, true);
        assert.equal(button.shown, false);
        await assert.doesNotReject(async () => button.listeners.click());
        assert.equal(event.prompts, 0);
    });
}

test('Android is also recognised from the client-hints platform, even with a desktop-style user agent', () => {
    assert.equal(isAndroid({ userAgent: UA.linuxDesktop, userAgentData: { platform: 'Android' } }), true);
});

test('the client-hints platform is compared without regard to case', () => {
    assert.equal(isAndroid({ userAgent: UA.linuxDesktop, userAgentData: { platform: 'android' } }), true);
    assert.equal(isAndroid({ userAgent: UA.linuxDesktop, userAgentData: { platform: 'ANDROID' } }), true);
});

for (const [label, ua] of [['Linux desktop', UA.linuxDesktop], ['Windows', UA.windows], ['macOS', UA.mac], ['iPhone', UA.iphone]]) {
    test(`${label}: the button is offered`, () => {
        const button = fakeButton();
        const win = fakeWindow({ userAgent: ua });
        init(doc(button), win);
        win.listeners.beforeinstallprompt(promptEvent());
        assert.equal(button.shown, true);
    });
}

// ------------------------------------------------------------------------------------ config

test('config.installOnAndroid: true offers the button on Android too', () => {
    const button = fakeButton();
    const win = fakeWindow({ userAgent: UA.androidPhone });
    init(doc(button), win, { enabled: true, installOnAndroid: true });
    win.listeners.beforeinstallprompt(promptEvent());
    assert.equal(button.shown, true);
});

test('config.installOnAndroid: false (or absent) keeps Android on the native app', () => {
    for (const config of [{ installOnAndroid: false }, {}, undefined]) {
        const button = fakeButton();
        const win = fakeWindow({ userAgent: UA.androidPhone });
        init(doc(button), win, config);
        win.listeners.beforeinstallprompt(promptEvent());
        assert.equal(button.shown, false, JSON.stringify(config));
    }
});

test('config.enabled: false registers nothing, so no browser banner is suppressed and no button appears', () => {
    const button = fakeButton();
    const win = fakeWindow({ userAgent: UA.windows });
    init(doc(button), win, { enabled: false, installOnAndroid: true });
    assert.deepEqual(Object.keys(win.listeners), []);
    assert.equal(button.shown, false);
});

test('config.enabled: anything but an explicit false means enabled', () => {
    for (const config of [undefined, {}, { enabled: true }, { enabled: undefined }]) {
        const button = fakeButton();
        const win = fakeWindow({ userAgent: UA.windows });
        init(doc(button), win, config);
        win.listeners.beforeinstallprompt(promptEvent());
        assert.equal(button.shown, true, JSON.stringify(config));
    }
});

test('isAndroid: unknown or missing navigator data is not Android', () => {
    assert.equal(isAndroid(undefined), false);
    assert.equal(isAndroid({}), false);
    assert.equal(isAndroid({ userAgent: '' }), false);
    assert.equal(isAndroid({ userAgent: UA.linuxDesktop, userAgentData: { platform: 'Linux' } }), false);
});

test('a page without the button registers nothing and does not throw', () => {
    const win = fakeWindow();
    assert.doesNotThrow(() => init(doc(null), win));
    assert.deepEqual(Object.keys(win.listeners), []);
});

test('an offer that arrives while the prompt is open is kept: the button stays and works', async () => {
    const button = fakeButton();
    const win = fakeWindow();
    init(doc(button), win);
    let finish;
    const first = promptEvent({ outcome: 'dismissed' });
    first.userChoice = new Promise((resolve) => { finish = () => resolve({ outcome: 'dismissed' }); });
    win.listeners.beforeinstallprompt(first);
    const tap = button.listeners.click();
    const fresh = promptEvent({ outcome: 'accepted' });
    win.listeners.beforeinstallprompt(fresh); // the browser re-offers while the prompt is still open
    finish();
    await tap;
    assert.equal(button.shown, true, 'a usable offer exists, so the button must not be hidden');
    await button.listeners.click();
    assert.equal(fresh.prompts, 1);
});

// --- Android download gate (share-to-unlock) ---------------------------------------------------

const SHARED_KEY = 'develop4God_shared';

function loadGateModules() {
    const win = {};
    for (const file of ['devotional-share-tracker.js', 'devotional-install.js']) {
        const filename = path.join(__dirname, file);
        const source = fs.readFileSync(filename, 'utf8');
        vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    }
    return win;
}

function gateStorage(initial = {}) {
    const store = { ...initial };
    return {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
    };
}

function gateRig({ ua = UA.androidPhone, storage = gateStorage(), withTracker = true, canShare = true } = {}) {
    const loaded = loadGateModules();
    const win = fakeWindow(canShare ? { userAgent: ua, share: () => Promise.resolve() } : { userAgent: ua });
    Object.defineProperty(win, 'localStorage', { get: () => storage, configurable: true });
    if (withTracker) win.DevotionalShareTracker = loaded.DevotionalShareTracker;
    const button = fakeButton();
    const elements = { 'download-app-android-btn': button };
    const document = {
        querySelector: () => null,
        getElementById: (id) => elements[id] || null,
    };
    return { api: loaded.DevotionalInstall, win, document, button };
}

function blockStorage(win) {
    Object.defineProperty(win, 'localStorage', {
        get: () => { throw new Error('SecurityError'); },
        configurable: true,
    });
}

test('gate: Android + shared reveals the download button', () => {
    const rig = gateRig({ storage: gateStorage({ [SHARED_KEY]: '1' }) });
    rig.api.refreshDownloadGate(rig.document, rig.win);
    assert.equal(rig.button.shown, true);
});

test('gate: Android without a share keeps the button hidden', () => {
    const rig = gateRig();
    rig.api.refreshDownloadGate(rig.document, rig.win);
    assert.equal(rig.button.shown, false);
});

test('gate: shared but not Android keeps the button hidden', () => {
    for (const ua of [UA.iphone, UA.windows, UA.mac]) {
        const rig = gateRig({ ua, storage: gateStorage({ [SHARED_KEY]: '1' }) });
        rig.api.refreshDownloadGate(rig.document, rig.win);
        assert.equal(rig.button.shown, false, ua);
    }
});

test('gate: Android without Web Share shows the button, since sharing can never unlock it', () => {
    const rig = gateRig({ canShare: false });
    rig.api.refreshDownloadGate(rig.document, rig.win);
    assert.equal(rig.button.shown, true);
});

test('gate: no Web Share but not Android still keeps the button hidden', () => {
    const rig = gateRig({ canShare: false, ua: UA.windows });
    rig.api.refreshDownloadGate(rig.document, rig.win);
    assert.equal(rig.button.shown, false);
});

test('gate: blocked storage does not throw and keeps the button hidden', () => {
    const rig = gateRig();
    blockStorage(rig.win);
    assert.doesNotThrow(() => rig.api.refreshDownloadGate(rig.document, rig.win));
    assert.equal(rig.button.shown, false);
});

test('gate: missing tracker or missing element is a safe no-op', () => {
    const noTracker = gateRig({ withTracker: false, storage: gateStorage({ [SHARED_KEY]: '1' }) });
    assert.doesNotThrow(() => noTracker.api.refreshDownloadGate(noTracker.document, noTracker.win));
    assert.equal(noTracker.button.shown, false);
    const rig = gateRig({ storage: gateStorage({ [SHARED_KEY]: '1' }) });
    assert.doesNotThrow(() => rig.api.refreshDownloadGate({ getElementById: () => null }, rig.win));
});

test('gate: re-checking after markShared reveals the button without a reload', () => {
    const rig = gateRig();
    rig.api.refreshDownloadGate(rig.document, rig.win);
    assert.equal(rig.button.shown, false);
    rig.win.DevotionalShareTracker.markShared(rig.win.localStorage);
    rig.api.refreshDownloadGate(rig.document, rig.win);
    assert.equal(rig.button.shown, true);
});

test('gate: init applies the gate even with the PWA disabled', () => {
    const rig = gateRig({ storage: gateStorage({ [SHARED_KEY]: '1' }) });
    rig.api.init(rig.document, rig.win, { enabled: false });
    assert.equal(rig.button.shown, true);
});

test('gate: init survives blocked storage and still wires the install listeners', () => {
    const rig = gateRig();
    blockStorage(rig.win);
    const installButton = fakeButton();
    const document = { ...rig.document, querySelector: (s) => (s === '[data-install]' ? installButton : null) };
    assert.doesNotThrow(() => rig.api.init(document, rig.win, {}));
    assert.equal(typeof rig.win.listeners.beforeinstallprompt, 'function');
});

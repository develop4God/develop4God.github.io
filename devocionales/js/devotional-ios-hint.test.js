const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const win = {};
    for (const file of ['devotional-standalone.js', 'devotional-ios-hint.js']) {
        const filename = path.join(__dirname, file);
        const source = fs.readFileSync(filename, 'utf8');
        vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    }
    return win.DevotionalIosHint;
}

const { init, isIos, canAddToHomeScreen } = loadModule();

const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    macDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
};

function fakeElement(initiallyHidden = true) {
    const classes = new Set(initiallyHidden ? ['hidden'] : []);
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

function fakeDocument({ hint = fakeElement(), close = fakeElement(false) } = {}) {
    return {
        hint,
        close,
        querySelector: (selector) => ({ '[data-ios-hint]': hint, '[data-ios-hint-close]': close })[selector] || null,
    };
}

function fakeWindow({ navigator = { userAgent: UA.iphone }, standalone = false, stored = {}, storage } = {}) {
    const store = { ...stored };
    return {
        store,
        navigator: { ...navigator, standalone: navigator.standalone },
        matchMedia: (query) => ({ matches: standalone && query === '(display-mode: standalone)' }),
        localStorage: storage || {
            getItem: (key) => (key in store ? store[key] : null),
            setItem: (key, value) => { store[key] = String(value); },
        },
    };
}

// ----------------------------------------------------------------------------------- isIos

test('isIos: iPhone and iPad user agents', () => {
    assert.equal(isIos({ userAgent: UA.iphone }), true);
    assert.equal(isIos({ userAgent: UA.ipad }), true);
});

test('isIos: iPadOS reporting a Mac user agent is recognised by its touch screen', () => {
    assert.equal(isIos({ userAgent: UA.macDesktop, platform: 'MacIntel', maxTouchPoints: 5 }), true);
});

test('isIos: a real Mac, Android, Windows and missing data are not iOS', () => {
    assert.equal(isIos({ userAgent: UA.macDesktop, platform: 'MacIntel', maxTouchPoints: 0 }), false);
    assert.equal(isIos({ userAgent: UA.android }), false);
    assert.equal(isIos({ userAgent: UA.windows }), false);
    assert.equal(isIos({}), false);
    assert.equal(isIos(undefined), false);
});

// ------------------------------------------------------------------ canAddToHomeScreen

// Safari, Chrome and Firefox on iOS carry a `Safari/` token; the web views inside other apps do not,
// and those have no Share > Add to Home Screen.
const IN_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const FIREFOX_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15';

test('canAddToHomeScreen: Safari, Chrome and Firefox on iOS can; in-app web views cannot', () => {
    assert.equal(canAddToHomeScreen({ userAgent: UA.iphone }), true);
    assert.equal(canAddToHomeScreen({ userAgent: CHROME_IOS }), true);
    assert.equal(canAddToHomeScreen({ userAgent: FIREFOX_IOS }), true);
    assert.equal(canAddToHomeScreen({ userAgent: IN_APP }), false);
});

test('canAddToHomeScreen: not iOS, or no data, is false', () => {
    assert.equal(canAddToHomeScreen({ userAgent: UA.android }), false);
    assert.equal(canAddToHomeScreen(undefined), false);
});

test('init: the hint is not shown in an in-app web view', () => {
    const doc = fakeDocument();
    init(doc, fakeWindow({ navigator: { userAgent: IN_APP } }), {});
    assert.equal(doc.hint.shown, false);
});

// ------------------------------------------------------------------------------------- init

test('init: shows the hint on iOS in a browser tab that has not dismissed it', () => {
    const doc = fakeDocument();
    init(doc, fakeWindow(), {});
    assert.equal(doc.hint.shown, true);
});

test('init: stays hidden when the app is already installed (standalone)', () => {
    const doc = fakeDocument();
    init(doc, fakeWindow({ standalone: true }), {});
    assert.equal(doc.hint.shown, false);
});

test('init: stays hidden on every platform that is not iOS', () => {
    for (const ua of [UA.android, UA.windows, UA.macDesktop]) {
        const doc = fakeDocument();
        init(doc, fakeWindow({ navigator: { userAgent: ua } }), {});
        assert.equal(doc.hint.shown, false, ua);
    }
});

test('init: stays hidden once the reader dismissed it', () => {
    const doc = fakeDocument();
    init(doc, fakeWindow({ stored: { devocionalesIosHintDismissed: '1' } }), {});
    assert.equal(doc.hint.shown, false);
});

test('init: closing hides it and remembers the choice', () => {
    const doc = fakeDocument();
    const win = fakeWindow();
    init(doc, win, {});
    doc.close.listeners.click();
    assert.equal(doc.hint.shown, false);
    assert.equal(win.store.devocionalesIosHintDismissed, '1');
});

test('init: with the PWA switched off it never shows', () => {
    const doc = fakeDocument();
    init(doc, fakeWindow(), { enabled: false });
    assert.equal(doc.hint.shown, false);
});

test('init: anything but an explicit enabled: false means enabled', () => {
    for (const config of [undefined, {}, { enabled: true }]) {
        const doc = fakeDocument();
        init(doc, fakeWindow(), config);
        assert.equal(doc.hint.shown, true, JSON.stringify(config));
    }
});

test('init: unusable storage (private mode) shows the hint and closing still works', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const doc = fakeDocument();
    init(doc, fakeWindow({ storage: throwing }), {});
    assert.equal(doc.hint.shown, true);
    assert.doesNotThrow(() => doc.close.listeners.click());
    assert.equal(doc.hint.shown, false);
});

test('init: a page without the hint element does nothing and does not throw', () => {
    const doc = { querySelector: () => null };
    assert.doesNotThrow(() => init(doc, fakeWindow(), {}));
});

// An older cached page does not load devotional-standalone.js: the hint must stay quiet, not throw.
test('init: without the standalone module the hint stays hidden and nothing throws', () => {
    const filename = path.join(__dirname, 'devotional-ios-hint.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    const doc = fakeDocument();
    assert.doesNotThrow(() => win.DevotionalIosHint.init(doc, fakeWindow(), {}));
    assert.equal(doc.hint.shown, false);
});

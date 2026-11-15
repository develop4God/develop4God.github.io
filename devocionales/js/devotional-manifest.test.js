const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const filename = path.join(__dirname, 'devotional-manifest.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalManifest;
}

const { init, hrefFor } = loadModule();
const SUPPORTED = ['es', 'en', 'zh', 'hi'];

const ANDROID = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130 Mobile Safari/537.36' };
const DESKTOP = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130 Safari/537.36' };

function loadStandalone() {
    const filename = path.join(__dirname, 'devotional-standalone.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalStandalone;
}

function rig({ lang = 'zh', ready = true, withLink = true, navigator = DESKTOP, platform = true } = {}) {
    const state = { lang, handlers: [], readyCallbacks: [], present: withLink };
    const link = {
        href: '/devocionales/manifest.webmanifest',
        remove() { state.present = false; },
    };
    const win = {
        navigator,
        ...(platform ? { DevotionalStandalone: loadStandalone() } : {}),
        i18n: { currentLang: lang, supportedLanguages: Object.fromEntries(SUPPORTED.map((c) => [c, {}])) },
        DevotionalI18n: {
            whenReady: (cb) => (ready ? cb() : state.readyCallbacks.push(cb)),
            onLanguageChanged: (handler) => state.handlers.push(handler),
        },
    };
    const doc = { querySelector: (s) => (s === 'link[rel="manifest"]' && state.present ? link : null) };
    return { link, state, win, doc };
}

test('hrefFor: the manifest of that language, and the default manifest for an unknown one', () => {
    assert.equal(hrefFor('zh', SUPPORTED), '/devocionales/manifests/zh.webmanifest');
    assert.equal(hrefFor('xx', SUPPORTED), '/devocionales/manifest.webmanifest');
    assert.equal(hrefFor(undefined, SUPPORTED), '/devocionales/manifest.webmanifest');
    assert.equal(hrefFor('../x', SUPPORTED), '/devocionales/manifest.webmanifest');
});

test('init: once i18n is ready the manifest link points at the current language', () => {
    const r = rig({ lang: 'hi' });
    init(r.doc, r.win);
    assert.equal(r.link.href, '/devocionales/manifests/hi.webmanifest');
});

test('init: waits for i18n instead of reading a language that is not known yet', () => {
    const r = rig({ lang: 'zh', ready: false });
    init(r.doc, r.win);
    assert.equal(r.link.href, '/devocionales/manifest.webmanifest');
    r.state.readyCallbacks.forEach((cb) => cb());
    assert.equal(r.link.href, '/devocionales/manifests/zh.webmanifest');
});

test('a language change moves the link to the new language', () => {
    const r = rig({ lang: 'en' });
    init(r.doc, r.win);
    r.win.i18n.currentLang = 'zh';
    r.state.handlers.forEach((h) => h());
    assert.equal(r.link.href, '/devocionales/manifests/zh.webmanifest');
});

test('no manifest link, or no i18n, is a safe no-op', () => {
    const noLink = rig({ withLink: false });
    assert.doesNotThrow(() => init(noLink.doc, noLink.win));
    assert.doesNotThrow(() => init(rig().doc, {}));
});

test('init runs before window.i18n exists: it still follows the language once i18n is ready', () => {
    const r = rig({ lang: 'hi', ready: false });
    const i18n = r.win.i18n;
    delete r.win.i18n; // the page script runs before i18n.js has created the singleton
    init(r.doc, r.win);
    r.win.i18n = i18n;
    r.state.readyCallbacks.forEach((cb) => cb());
    assert.equal(r.link.href, '/devocionales/manifests/hi.webmanifest');
});

// ---------------------------------------------------------------------- Android: not installable

test('5a Android: the static manifest link is removed and none is left', () => {
    const r = rig({ navigator: ANDROID });
    init(r.doc, r.win, { enabled: true });
    assert.equal(r.state.present, false);
    assert.equal(r.doc.querySelector('link[rel="manifest"]'), null);
});

test('5a Android: no i18n sync is registered after the link is removed', () => {
    const r = rig({ navigator: ANDROID, ready: false });
    init(r.doc, r.win, { enabled: true });
    assert.equal(r.state.readyCallbacks.length, 0);
    assert.equal(r.state.handlers.length, 0);
});

test('5a Android: removal does not depend on DevotionalI18n or the config', () => {
    const r = rig({ navigator: ANDROID });
    delete r.win.DevotionalI18n;
    assert.doesNotThrow(() => init(r.doc, r.win, undefined));
    assert.equal(r.state.present, false);
});

test('5b non-Android: the one link is kept and localized as before', () => {
    const r = rig({ lang: 'zh', navigator: DESKTOP });
    init(r.doc, r.win, { enabled: true });
    assert.equal(r.state.present, true);
    assert.equal(r.link.href, '/devocionales/manifests/zh.webmanifest');
});

test('5c enabled:false: init never adds a link back (the link is already gone)', () => {
    for (const navigator of [DESKTOP, ANDROID]) {
        const r = rig({ withLink: false, navigator });
        r.doc.createElement = () => { throw new Error('init must not create a link'); };
        r.doc.head = { appendChild: () => { throw new Error('init must not add a link'); } };
        assert.doesNotThrow(() => init(r.doc, r.win, { enabled: false }));
        assert.equal(r.state.present, false);
    }
});

test('5d init never creates a link, so no platform ends with more than the one static link', () => {
    for (const navigator of [DESKTOP, ANDROID]) {
        const r = rig({ navigator });
        r.doc.createElement = () => { throw new Error('init must not create a link'); };
        assert.doesNotThrow(() => init(r.doc, r.win, { enabled: true }));
    }
});

test('5e non-Android without DevotionalI18n keeps the link on the default manifest', () => {
    const r = rig({ navigator: DESKTOP });
    delete r.win.DevotionalI18n;
    assert.doesNotThrow(() => init(r.doc, r.win, { enabled: true }));
    assert.equal(r.state.present, true);
    assert.equal(r.link.href, '/devocionales/manifest.webmanifest');
});

test('5f without DevotionalPwaConfig nothing throws and a non-Android link is kept', () => {
    const r = rig({ navigator: DESKTOP });
    assert.doesNotThrow(() => init(r.doc, r.win, undefined));
    assert.equal(r.state.present, true);
    assert.equal(r.link.href, '/devocionales/manifests/zh.webmanifest');
});

test('5g without DevotionalStandalone nothing throws and the link is kept, even on an Android user agent', () => {
    const r = rig({ navigator: ANDROID, platform: false });
    assert.doesNotThrow(() => init(r.doc, r.win, { enabled: true }));
    assert.equal(r.state.present, true);
});

test('a window without navigator is treated as not Android', () => {
    const r = rig({ navigator: undefined });
    assert.doesNotThrow(() => init(r.doc, r.win, {}));
    assert.equal(r.state.present, true);
});

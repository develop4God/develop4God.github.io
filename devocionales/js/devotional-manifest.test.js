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

function rig({ lang = 'zh', ready = true, withLink = true } = {}) {
    const link = { href: '/devocionales/manifest.webmanifest' };
    const state = { lang, handlers: [], readyCallbacks: [] };
    const win = {
        i18n: { currentLang: lang, supportedLanguages: Object.fromEntries(SUPPORTED.map((c) => [c, {}])) },
        DevotionalI18n: {
            whenReady: (cb) => (ready ? cb() : state.readyCallbacks.push(cb)),
            onLanguageChanged: (handler) => state.handlers.push(handler),
        },
    };
    const doc = { querySelector: (s) => (s === 'link[rel="manifest"]' && withLink ? link : null) };
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

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STANDALONE_FILE = path.join(__dirname, '..', 'js', 'devotional-standalone.js');
const ORIGIN = 'https://develop4god.com';
const CONTACT = 'contact@example.org';

function load(file, win) {
    const source = fs.readFileSync(file, 'utf8');
    vm.runInThisContext(`(function(window){${source}\n})`, { filename: file })(win);
}

// The real standalone module (the detection is reused, never re-implemented), unless a test
// passes its own `standalone` (null = the script is missing).
function loadCore({ standalone } = {}) {
    const win = {};
    if (standalone === undefined) load(STANDALONE_FILE, win);
    else if (standalone !== null) win.DevotionalStandalone = standalone;
    load(path.join(__dirname, 'devotional-shell-core.js'), win);
    return win.DevotionalShellCore;
}

const CONFIG = { enabled: true, surfaces: { shell: { enabled: true } } };
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
const iosApp = { navigator: { standalone: true, userAgent: 'iPhone' } };
const desktopApp = { navigator: { userAgent: 'X11; Linux' }, matchMedia: () => ({ matches: true }) };
const browserTab = { navigator: { standalone: false, userAgent: 'X11; Linux' }, matchMedia: () => ({ matches: false }) };

test('isShellSurface: the installed app on iOS and on desktop gets the shell', () => {
    const { isShellSurface } = loadCore();
    assert.equal(isShellSurface(iosApp, CONFIG), true);
    assert.equal(isShellSurface(desktopApp, CONFIG), true);
});

test('isShellSurface: a browser tab never gets the shell', () => {
    assert.equal(loadCore().isShellSurface(browserTab, CONFIG), false);
});

test('isShellSurface: an installed Android app gets no shell (client hints and user agent)', () => {
    const { isShellSurface } = loadCore();
    assert.equal(isShellSurface({ navigator: { standalone: true, userAgent: ANDROID_UA } }, CONFIG), false);
    assert.equal(isShellSurface({ navigator: { userAgentData: { platform: 'Android' }, userAgent: 'x' }, matchMedia: () => ({ matches: true }) }, CONFIG), false);
});

test('isShellSurface: switched off by the master switch, the shell switch, or a missing config', () => {
    const { isShellSurface } = loadCore();
    assert.equal(isShellSurface(iosApp, { ...CONFIG, enabled: false }), false);
    assert.equal(isShellSurface(iosApp, { enabled: true, surfaces: { shell: { enabled: false } } }), false);
    assert.equal(isShellSurface(iosApp, { enabled: true }), false);
    assert.equal(isShellSurface(iosApp, { enabled: true, surfaces: {} }), false);
    assert.equal(isShellSurface(iosApp, undefined), false);
    assert.equal(isShellSurface(iosApp, null), false);
});

test('isShellSurface: an unknown surface fails closed (no, or an older, standalone module)', () => {
    assert.equal(loadCore({ standalone: null }).isShellSurface(iosApp, CONFIG), false);
    assert.equal(loadCore({ standalone: { isStandalone: () => true } }).isShellSurface(iosApp, CONFIG), false);
    assert.equal(loadCore({ standalone: { isAndroid: () => false } }).isShellSurface(iosApp, CONFIG), false);
});

const link = (href, extra) => ({ href, ...extra });
const NEW_TAB = { target: '_blank', rel: 'noopener' };

test('isAllowedLink: navigation stays inside /devocionales/', () => {
    const { isAllowedLink } = loadCore();
    for (const href of ['/devocionales/', '/devocionales/privacy-policy.html', '/devocionales/?lang=en', '/devocionales', '#main', 'privacy-policy.html', `${ORIGIN}/devocionales/terms-and-conditions.html`]) {
        assert.equal(isAllowedLink(link(href), ORIGIN, CONTACT), true, href);
    }
});

test('isAllowedLink: the rest of the site and look-alike paths are refused', () => {
    const { isAllowedLink } = loadCore();
    for (const href of ['/', '/habitus/', '/work-with-me/', '/devocionales-evil/', '/legacy/', `${ORIGIN}/`, '/devocionales/../habitus/']) {
        assert.equal(isAllowedLink(link(href), ORIGIN, CONTACT), false, href);
    }
});

test('isAllowedLink: only the contact mailto is allowed', () => {
    const { isAllowedLink } = loadCore();
    assert.equal(isAllowedLink(link(`mailto:${CONTACT}`), ORIGIN, CONTACT), true);
    assert.equal(isAllowedLink(link(`mailto:${CONTACT.toUpperCase()}?subject=Hi`), ORIGIN, CONTACT), true);
    assert.equal(isAllowedLink(link('mailto:someone@else.com'), ORIGIN, CONTACT), false);
    assert.equal(isAllowedLink(link(`mailto:${CONTACT}`), ORIGIN), false, 'no contact configured');
});

test('isAllowedLink: PayPal, share targets and Bible references need a new tab with noopener', () => {
    const { isAllowedLink } = loadCore();
    const allowed = [
        'https://www.paypal.com/paypalme/develop4godOfficial',
        'https://wa.me/?text=hi',
        'https://www.facebook.com/sharer/sharer.php?u=x',
        'https://x.com/intent/post?text=x',
        'https://t.me/share/url?url=x',
        'https://www.bible.com/bible/111/JHN.3.16',
        'https://www.biblegateway.com/passage/?search=John+3',
    ];
    for (const href of allowed) {
        assert.equal(isAllowedLink(link(href, NEW_TAB), ORIGIN, CONTACT), true, href);
        assert.equal(isAllowedLink(link(href), ORIGIN, CONTACT), false, `${href} without target/rel`);
        assert.equal(isAllowedLink(link(href, { target: '_blank' }), ORIGIN, CONTACT), false, `${href} without noopener`);
        assert.equal(isAllowedLink(link(href, { target: '_self', rel: 'noopener' }), ORIGIN, CONTACT), false, `${href} same tab`);
    }
    assert.equal(isAllowedLink(link(allowed[0], { target: '_blank', rel: 'nofollow noopener noreferrer' }), ORIGIN, CONTACT), true);
});

test('isAllowedLink: Google Play and every other external link is refused, whatever the attributes', () => {
    const { isAllowedLink } = loadCore();
    for (const href of [
        'https://play.google.com/store/apps/details?id=com.develop4god.devocional_nuevo',
        'https://example.com/',
        'http://www.paypal.com/paypalme/develop4godOfficial',
        'https://paypal.com.evil.com/paypalme/x',
        'https://www.facebook.com/someone',
        'javascript:alert(1)',
        'tel:+123456',
        'https://user@www.paypal.com.evil.com/',
    ]) {
        assert.equal(isAllowedLink(link(href, NEW_TAB), ORIGIN, CONTACT), false, href);
    }
});

test('isAllowedLink: a missing href is not navigation, an unparsable one is refused', () => {
    const { isAllowedLink } = loadCore();
    assert.equal(isAllowedLink(link(null), ORIGIN, CONTACT), true);
    assert.equal(isAllowedLink(link(''), ORIGIN, CONTACT), true);
    assert.equal(isAllowedLink(link('http://'), ORIGIN, CONTACT), false);
});

test('createTabState: starts on the requested tab, falls back to the first', () => {
    const { createTabState } = loadCore();
    assert.equal(createTabState(['home', 'settings'], 'settings').current(), 'settings');
    assert.equal(createTabState(['home', 'settings'], 'nope').current(), 'home');
    assert.equal(createTabState(['home', 'settings']).current(), 'home');
});

test('createTabState: select reports a change, ignores the current and unknown tabs', () => {
    const { createTabState } = loadCore();
    const state = createTabState(['home', 'settings'], 'home');
    assert.equal(state.select('settings'), true);
    assert.equal(state.current(), 'settings');
    assert.equal(state.select('settings'), false);
    assert.equal(state.select('missing'), false);
    assert.equal(state.select(undefined), false);
    assert.equal(state.current(), 'settings');
    assert.equal(state.select('home'), true);
});

test('createTabState: no tabs (empty, missing, not an array) means no current tab and nothing to select', () => {
    const { createTabState } = loadCore();
    for (const tabs of [[], undefined, null, 'home']) {
        const state = createTabState(tabs, 'home');
        assert.equal(state.current(), null);
        assert.equal(state.select('home'), false);
    }
});

test('createTabState: duplicate names collapse, and the tabs list is a copy', () => {
    const { createTabState } = loadCore();
    const input = ['home', 'home', 'settings'];
    const state = createTabState(input, 'home');
    assert.deepEqual(state.tabs, ['home', 'settings']);
    input.push('x');
    assert.deepEqual(state.tabs, ['home', 'settings']);
});

// ---- resolveInitialTab: the studies page links to Settings with #settings ----

test('resolveInitialTab: #settings opens Settings when that tab exists, anything else opens Home', () => {
    const { resolveInitialTab } = loadCore();
    assert.equal(resolveInitialTab('#settings', ['home', 'settings']), 'settings');
    assert.equal(resolveInitialTab('', ['home', 'settings']), 'home');
    assert.equal(resolveInitialTab('#other', ['home', 'settings']), 'home');
    assert.equal(resolveInitialTab('#SETTINGS', ['home', 'settings']), 'home');
    assert.equal(resolveInitialTab(undefined, ['home', 'settings']), 'home');
    assert.equal(resolveInitialTab(null, ['home', 'settings']), 'home');
});

test('resolveInitialTab: a hash for a tab the kill switch removed falls back to Home (or the first tab)', () => {
    const { resolveInitialTab } = loadCore();
    assert.equal(resolveInitialTab('#settings', ['home']), 'home');
    assert.equal(resolveInitialTab('#settings', ['settings']), 'settings');
    assert.equal(resolveInitialTab('#settings', []), 'home');
    assert.equal(resolveInitialTab('#settings', 'settings'), 'home');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const filename = path.join(__dirname, 'devotional-standalone.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalStandalone;
}

const { isStandalone, apply, isAndroid } = loadModule();

function fakeDoc(links) {
    const classes = new Set();
    return {
        classes,
        documentElement: { classList: { add: (c) => classes.add(c) } },
        querySelectorAll: (selector) => (selector === 'a[href="/"]' ? links : []),
    };
}

test('isStandalone: the iOS flag, or the display-mode media query', () => {
    assert.equal(isStandalone({ navigator: { standalone: true } }), true);
    assert.equal(isStandalone({ navigator: {}, matchMedia: () => ({ matches: true }) }), true);
});

test('isStandalone: a normal tab, and browsers without matchMedia, are not standalone', () => {
    assert.equal(isStandalone({ navigator: { standalone: false }, matchMedia: () => ({ matches: false }) }), false);
    assert.equal(isStandalone({ navigator: {} }), false);
});

test('apply: in the installed app the class is set and every link to the home page is inert', () => {
    const links = [{ inert: false }, { inert: false }];
    const doc = fakeDoc(links);
    assert.equal(apply(doc, { navigator: { standalone: true } }), true);
    assert.equal(doc.classes.has('is-standalone'), true);
    assert.deepEqual(links.map((l) => l.inert), [true, true]);
});

test('apply: in a normal tab nothing changes', () => {
    const links = [{ inert: false }];
    const doc = fakeDoc(links);
    assert.equal(apply(doc, { navigator: {}, matchMedia: () => ({ matches: false }) }), false);
    assert.equal(doc.classes.size, 0);
    assert.equal(links[0].inert, false);
});

test('apply: a page without such links is a safe no-op', () => {
    const doc = fakeDoc([]);
    assert.doesNotThrow(() => apply(doc, { navigator: { standalone: true } }));
    assert.equal(doc.classes.has('is-standalone'), true);
});

// ------------------------------------------------------------------------------ isAndroid

const UA = {
    androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36',
    androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
    linuxDesktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

for (const [label, ua] of [['phone', UA.androidPhone], ['tablet', UA.androidTablet], ['Firefox', UA.androidFirefox]]) {
    test(`Android ${label} is recognised from the user agent`, () => {
        assert.equal(isAndroid({ userAgent: ua }), true);
    });
}

for (const [label, ua] of [['Linux desktop', UA.linuxDesktop], ['Windows', UA.windows], ['macOS', UA.mac], ['iPhone', UA.iphone]]) {
    test(`${label} is not Android`, () => {
        assert.equal(isAndroid({ userAgent: ua }), false);
    });
}

test('Android is also recognised from the client-hints platform, even with a desktop-style user agent', () => {
    assert.equal(isAndroid({ userAgent: UA.linuxDesktop, userAgentData: { platform: 'Android' } }), true);
});

test('the client-hints platform is compared without regard to case', () => {
    assert.equal(isAndroid({ userAgent: UA.linuxDesktop, userAgentData: { platform: 'android' } }), true);
    assert.equal(isAndroid({ userAgent: UA.linuxDesktop, userAgentData: { platform: 'ANDROID' } }), true);
});

test('unknown or missing navigator data is not Android', () => {
    assert.equal(isAndroid(undefined), false);
    assert.equal(isAndroid(null), false);
    assert.equal(isAndroid({}), false);
    assert.equal(isAndroid({ userAgent: '' }), false);
    assert.equal(isAndroid({ userAgent: UA.linuxDesktop, userAgentData: { platform: 'Linux' } }), false);
});

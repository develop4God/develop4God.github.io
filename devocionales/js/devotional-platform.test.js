const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const filename = path.join(__dirname, 'devotional-platform.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalPlatform;
}

const { isAndroid } = loadModule();

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

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadInto(win, file) {
    const filename = path.join(__dirname, file);
    const source = fs.readFileSync(filename, 'utf8');
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
}

const globals = {};
loadInto(globals, 'devotional-standalone.js');
loadInto(globals, 'devotional-ios-hint.js');
loadInto(globals, 'devotional-push-help.js');
const { helpKey } = globals.DevotionalPushHelp;

const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36',
};

test('iPhone and iPad get the iOS steps', () => {
    assert.equal(helpKey({ userAgent: UA.iphone }), 'push.blocked_ios');
    assert.equal(helpKey({ userAgent: UA.ipad }), 'push.blocked_ios');
});

test('iPadOS reporting as a Mac with a touch screen gets the iOS steps; a real Mac does not', () => {
    assert.equal(helpKey({ userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 5 }), 'push.blocked_ios');
    assert.equal(helpKey({ userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 0 }), 'push.blocked_desktop');
});

test('Windows, Mac and Linux get the desktop steps', () => {
    for (const userAgent of [UA.windows, UA.mac, UA.linux]) {
        assert.equal(helpKey({ userAgent }), 'push.blocked_desktop');
    }
});

test('Android never gets help text (push is not offered there)', () => {
    assert.equal(helpKey({ userAgent: UA.android }), null);
    assert.equal(helpKey({ userAgent: UA.linux, userAgentData: { platform: 'Android' } }), null);
});

test('a missing navigator or user agent does not throw', () => {
    assert.equal(helpKey(undefined), 'push.blocked_desktop');
    assert.equal(helpKey({}), 'push.blocked_desktop');
});

test('without the iOS helper (old cached page) it returns null (generic text) instead of wrong steps', () => {
    const bare = {};
    loadInto(bare, 'devotional-standalone.js');
    loadInto(bare, 'devotional-push-help.js');
    assert.equal(bare.DevotionalPushHelp.helpKey({ userAgent: UA.iphone }), null);
    assert.equal(bare.DevotionalPushHelp.helpKey({ userAgent: UA.windows }), null);
});

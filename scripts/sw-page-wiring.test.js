'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// A page that never starts DevotionalSwRegister never gets a new build: the reader who opens the app
// on it stays on the old one until they visit the reader page. Pages without an inline boot use
// devotional-sw-boot.js; the reader page calls start() itself.
const BOOT_PAGES = ['devocionales/encounters/index.html', 'devocionales/estudios/index.html'];

test('the pages without an inline boot load the register script, the config and the boot, in that order', () => {
    for (const page of BOOT_PAGES) {
        const html = read(page);
        const order = ['devotional-pwa-config.js', 'devotional-sw-register.js', 'devotional-sw-boot.js'].map((name) => html.indexOf(`/devocionales/js/${name}`));
        assert.ok(order.every((index) => index >= 0), `${page} must load all three`);
        assert.deepEqual([...order].sort((a, b) => a - b), order, `${page}: wrong order`);
    }
});

test('the reader page starts the worker logic itself', () => {
    assert.match(read('devocionales/index.html'), /DevotionalSwRegister\.start\(/);
});

test('the boot script starts the worker with the shared scope and config, and swallows a failure', () => {
    const source = read('devocionales/js/devotional-sw-boot.js');
    const calls = [];
    new Function('window', source)({ DevotionalSwRegister: { start: (...args) => calls.push(args) }, DevotionalPwaConfig: { enabled: true } });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(1), ['/devocionales/sw.js', '/devocionales/', { enabled: true }]);
    assert.doesNotThrow(() => new Function('window', source)({}), 'a missing register script must not throw');
});

test('every page that starts the worker also loads the update banner, after the register script', () => {
    for (const page of ['devocionales/index.html', ...BOOT_PAGES]) {
        const html = read(page);
        const register = html.indexOf('/devocionales/js/devotional-sw-register.js');
        const banner = html.indexOf('/devocionales/js/devotional-update-banner.js');
        assert.ok(banner >= 0, `${page} must load the banner`);
        assert.ok(banner > register, `${page}: the banner loads after the register script`);
    }
});

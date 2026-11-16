'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'devotional-theme.js');
const source = fs.readFileSync(filename, 'utf8');
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { createTheme } = global.window.DevotionalTheme;

function fakeRoot(initial) {
    const attrs = initial ? { 'data-theme': initial } : {};
    return {
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        setAttribute: (k, v) => { attrs[k] = v; },
    };
}
function fakeStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
function fakeToggle() {
    const listeners = {};
    const icon = () => { const set = new Set(); return { set, classList: { toggle: (c, on) => (on ? set.add(c) : set.delete(c)) } }; };
    const dark = icon();
    const light = icon();
    return {
        checked: false, dark, light, listeners,
        addEventListener: (ev, fn) => { listeners[ev] = fn; },
        parentElement: { querySelector: (sel) => (sel === '.theme-icon-dark' ? dark : light) },
    };
}
const make = (over = {}) => createTheme({ storage: fakeStorage(), root: fakeRoot(), prefersDark: () => false, ...over });

test('init: applies a stored dark or light theme to the root', () => {
    for (const saved of ['dark', 'light']) {
        const root = fakeRoot();
        make({ root, storage: fakeStorage({ theme: saved }) }).init();
        assert.equal(root.getAttribute('data-theme'), saved);
    }
});

test('init: ignores unknown stored values and leaves the system preference in charge', () => {
    for (const bad of ['purple', '', 'null', '"dark"']) {
        const root = fakeRoot();
        make({ root, storage: fakeStorage({ theme: bad }) }).init();
        assert.equal(root.getAttribute('data-theme'), null, bad);
    }
});

test('init: blocked storage does not throw and sets nothing', () => {
    const root = fakeRoot();
    assert.doesNotThrow(() => make({ root, storage: blocked }).init());
    assert.equal(root.getAttribute('data-theme'), null);
});

test('current: attribute wins, otherwise the system preference', () => {
    assert.equal(make({ root: fakeRoot('dark') }).current(), 'dark');
    assert.equal(make({ root: fakeRoot('light'), prefersDark: () => true }).current(), 'light');
    assert.equal(make({ prefersDark: () => true }).current(), 'dark');
    assert.equal(make({ prefersDark: () => false }).current(), 'light');
});

test('set: applies and stores a valid theme; rejects anything else', () => {
    const root = fakeRoot();
    const storage = fakeStorage();
    const theme = make({ root, storage });
    theme.set('dark');
    assert.equal(root.getAttribute('data-theme'), 'dark');
    assert.equal(storage.data.theme, 'dark');
    theme.set('neon');
    assert.equal(root.getAttribute('data-theme'), 'dark');
    assert.equal(storage.data.theme, 'dark');
});

test('set: blocked storage still applies the theme for this visit', () => {
    const root = fakeRoot();
    make({ root, storage: blocked }).set('dark');
    assert.equal(root.getAttribute('data-theme'), 'dark');
});

test('bindToggle: reflects the current theme on the switch and its icons', () => {
    const toggle = fakeToggle();
    make({ root: fakeRoot('dark') }).bindToggle(toggle);
    assert.equal(toggle.checked, true);
    assert.ok(toggle.dark.set.has('is-active'));
    assert.ok(!toggle.light.set.has('is-active'));
});

test('bindToggle: changing the switch sets and persists the new theme and syncs the icons', () => {
    const root = fakeRoot('light');
    const storage = fakeStorage();
    const toggle = fakeToggle();
    make({ root, storage }).bindToggle(toggle);
    toggle.checked = true;
    toggle.listeners.change();
    assert.equal(root.getAttribute('data-theme'), 'dark');
    assert.equal(storage.data.theme, 'dark');
    assert.ok(toggle.dark.set.has('is-active'));
    toggle.checked = false;
    toggle.listeners.change();
    assert.equal(root.getAttribute('data-theme'), 'light');
    assert.ok(toggle.light.set.has('is-active'));
});

test('bindToggle: a missing toggle is a no-op', () => {
    assert.doesNotThrow(() => make().bindToggle(null));
});

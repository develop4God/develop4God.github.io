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

const { isStandalone, apply } = loadModule();

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

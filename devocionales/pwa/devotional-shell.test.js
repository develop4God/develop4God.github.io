'use strict';

// renderNav of the installed-app shell: the "New" bubble on the Bible-studies and Encounters tabs
// follows the seen state, and tapping a bubble tab marks it seen. Uses a small fake DOM.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const SHELL_FILE = path.join(__dirname, 'devotional-shell.js');
const BADGE_FILE = path.join(__dirname, '..', 'js', 'devotional-nav-new-badge.js');

function fakeElement(tag) {
    return {
        tag,
        className: '',
        attrs: new Map(),
        children: [],
        listeners: [],
        textContent: '',
        setAttribute(name, value) { this.attrs.set(name, String(value)); },
        getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; },
        removeAttribute(name) { this.attrs.delete(name); },
        append(...nodes) { this.children.push(...nodes); },
        replaceChildren(...nodes) { this.children = nodes; },
        addEventListener(type, fn) { if (type === 'click') this.listeners.push(fn); },
        click() { this.listeners.forEach((fn) => fn()); },
        closest(sel) { return sel === 'a' && this.tag === 'a' ? this : null; },
    };
}

const fakeDoc = { createElement: fakeElement };

function memoryStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => { data.set(key, String(value)); },
    };
}

function loadShell(win) {
    const badgeWin = win;
    vm.runInThisContext(`(function(window){${fs.readFileSync(BADGE_FILE, 'utf8')}\n})`, { filename: BADGE_FILE })(badgeWin);
    vm.runInThisContext(`(function(window){${fs.readFileSync(SHELL_FILE, 'utf8')}\n})`, { filename: SHELL_FILE })(badgeWin);
    return badgeWin.DevotionalShell;
}

function tabsFixture() {
    const link = (name, href, badge) => ({
        name, kind: 'link', href, icon: name, labelKey: `shell.${name}`, fallback: name, current: false, badge,
    });
    return [
        link('studies', '/devocionales/estudios/', true),
        link('encounters', '/devocionales/encounters/', true),
    ];
}

function renderWith({ storage = memoryStorage(), tabs = tabsFixture() } = {}) {
    const win = { localStorage: storage };
    const shell = loadShell(win);
    const nav = fakeElement('nav');
    const items = shell.renderNav(fakeDoc, win, nav, tabs);
    return { items, storage, nav };
}

function hasBubble(item) {
    return item.children.some((child) => child.className === 'nav-new-badge');
}

test('an unseen tab shows its New bubble', () => {
    const { items } = renderWith();
    assert.equal(hasBubble(items[0]), true, 'studies tab');
    assert.equal(hasBubble(items[1]), true, 'encounters tab');
});

test('a tab already seen shows no bubble', () => {
    const { items } = renderWith({ storage: memoryStorage({ 'devotional.newBadgeSeen.studies': '1' }) });
    assert.equal(hasBubble(items[0]), false, 'seen studies tab');
    assert.equal(hasBubble(items[1]), true, 'unseen encounters tab keeps its bubble');
});

test('tapping a bubble tab marks it seen and the next render drops its bubble', () => {
    const storage = memoryStorage();
    const first = renderWith({ storage });
    first.items[1].click();
    assert.equal(storage.getItem('devotional.newBadgeSeen.encounters'), '1');
    const next = renderWith({ storage });
    assert.equal(hasBubble(next.items[1]), false);
});

test('blocked storage keeps the bubble visible and never throws', () => {
    const blocked = {
        getItem() { throw new Error('blocked'); },
        setItem() { throw new Error('blocked'); },
    };
    const { items } = renderWith({ storage: blocked });
    assert.doesNotThrow(() => items[0].click());
    assert.equal(hasBubble(items[0]), true);
});

test('a tab without the badge flag never gets a bubble, even when unseen', () => {
    const tabs = tabsFixture();
    tabs[0].badge = false;
    const { items } = renderWith({ tabs });
    assert.equal(hasBubble(items[0]), false);
});

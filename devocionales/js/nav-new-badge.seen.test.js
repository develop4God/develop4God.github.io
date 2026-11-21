'use strict';

// The "New" bubble disappears for good once the person taps its tab: the seen flag lives in
// localStorage, one key per tab. Logic-level checks of devotional-nav-new-badge.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const FILE = path.join(__dirname, 'devotional-nav-new-badge.js');

function load(win = {}) {
    vm.runInThisContext(`(function(window){${fs.readFileSync(FILE, 'utf8')}\n})`, { filename: FILE })(win);
    return win.DevotionalNewBadge;
}

function memoryStorage() {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => { data.set(key, String(value)); },
    };
}

const BROKEN_STORAGE = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
};

test('tabForHref maps the two bubble tabs to their names and nothing else', () => {
    const api = load();
    assert.equal(api.tabForHref('/devocionales/estudios/'), 'studies');
    assert.equal(api.tabForHref('/devocionales/encounters/'), 'encounters');
    assert.equal(api.tabForHref('/devocionales/'), null);
    assert.equal(api.tabForHref('https://example.org/'), null);
    assert.equal(api.tabForHref(null), null);
});

test('a tab is not seen until it is marked, and each tab is marked on its own', () => {
    const api = load();
    const storage = memoryStorage();
    assert.equal(api.isSeen(storage, 'studies'), false);
    api.markSeen(storage, 'studies');
    assert.equal(api.isSeen(storage, 'studies'), true);
    assert.equal(api.isSeen(storage, 'encounters'), false, 'marking one tab must not hide the other');
});

test('marking a tab twice is harmless', () => {
    const api = load();
    const storage = memoryStorage();
    api.markSeen(storage, 'encounters');
    api.markSeen(storage, 'encounters');
    assert.equal(api.isSeen(storage, 'encounters'), true);
});

test('seen state survives a new reader of the same storage (a later visit)', () => {
    const api = load();
    const storage = memoryStorage();
    api.markSeen(storage, 'studies');
    const laterVisit = load();
    assert.equal(laterVisit.isSeen(storage, 'studies'), true);
});

test('blocked storage never throws: the bubble simply stays visible', () => {
    const api = load();
    assert.doesNotThrow(() => api.markSeen(BROKEN_STORAGE, 'studies'));
    assert.equal(api.isSeen(BROKEN_STORAGE, 'studies'), false);
});

test('a missing storage object never throws', () => {
    const api = load();
    assert.doesNotThrow(() => api.markSeen(null, 'studies'));
    assert.equal(api.isSeen(undefined, 'studies'), false);
});

test('unknown tab names are ignored', () => {
    const api = load();
    const storage = memoryStorage();
    api.markSeen(storage, 'devotional');
    assert.equal(api.isSeen(storage, 'devotional'), false);
});

function fakeLink(href) {
    const listeners = [];
    return {
        getAttribute: (name) => (name === 'href' ? href : null),
        addEventListener: (type, fn) => { if (type === 'click') listeners.push(fn); },
        click: (event = {}) => listeners.forEach((fn) => fn(event)),
    };
}

function fakeBadge(href) {
    const link = fakeLink(href);
    return { removed: false, remove() { this.removed = true; }, closest: (sel) => (sel === 'a' ? link : null), link };
}

function fakeDocument(badges) {
    return { querySelectorAll: (sel) => (sel === '.nav-new-badge' ? badges : []) };
}

test('storageOf returns the window localStorage, or null when the browser blocks it', () => {
    const api = load();
    const storage = memoryStorage();
    assert.equal(api.storageOf({ localStorage: storage }), storage);
    const blocked = {};
    Object.defineProperty(blocked, 'localStorage', { get() { throw new Error('denied'); } });
    assert.equal(api.storageOf(blocked), null);
    assert.equal(api.storageOf({}), null);
});

test('wire removes the badges of tabs already seen and keeps the others', () => {
    const api = load();
    const storage = memoryStorage();
    api.markSeen(storage, 'studies');
    const studies = fakeBadge('/devocionales/estudios/');
    const encounters = fakeBadge('/devocionales/encounters/');
    api.wire(fakeDocument([studies, encounters]), storage);
    assert.equal(studies.removed, true, 'seen tab must lose its bubble');
    assert.equal(encounters.removed, false, 'unseen tab keeps its bubble');
});

test('wire marks an unseen tab as seen when its link is tapped', () => {
    const api = load();
    const storage = memoryStorage();
    const encounters = fakeBadge('/devocionales/encounters/');
    api.wire(fakeDocument([encounters]), storage);
    assert.equal(api.isSeen(storage, 'encounters'), false, 'not seen before the tap');
    encounters.link.click();
    assert.equal(api.isSeen(storage, 'encounters'), true);
});

test('wire ignores a badge whose link is not a bubble tab', () => {
    const api = load();
    const storage = memoryStorage();
    const devotional = fakeBadge('/devocionales/');
    api.wire(fakeDocument([devotional]), storage);
    assert.equal(devotional.removed, false);
});

test('loading the module on a page wires that page\'s static badges', () => {
    const storage = memoryStorage();
    storage.setItem('devotional.newBadgeSeen.studies', '1');
    const studies = fakeBadge('/devocionales/estudios/');
    const page = { document: fakeDocument([studies]), localStorage: storage };
    load(page);
    assert.equal(studies.removed, true, 'a seen static badge is removed on page load');
});

test('a modified click (ctrl, cmd, shift, middle) opens the tab in the background and does not mark it seen', () => {
    const api = load();
    const storage = memoryStorage();
    const encounters = fakeBadge('/devocionales/encounters/');
    api.wire(fakeDocument([encounters]), storage);
    encounters.link.click({ ctrlKey: true, button: 0 });
    encounters.link.click({ metaKey: true, button: 0 });
    encounters.link.click({ shiftKey: true, button: 0 });
    encounters.link.click({ button: 1 });
    assert.equal(api.isSeen(storage, 'encounters'), false);
    encounters.link.click({ button: 0 });
    assert.equal(api.isSeen(storage, 'encounters'), true, 'a plain tap still marks the tab');
});

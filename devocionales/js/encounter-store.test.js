'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const name of ['storage-json.js', 'encounter-store.js']) {
    const filename = path.join(__dirname, name);
    const source = fs.readFileSync(filename, 'utf8');
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
}
const { createEncounterStore, KEYS } = global.window.EncounterStore;

const memory = (initial = {}) => {
    const m = new Map(Object.entries(initial));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
};
const blocked = () => ({
    getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); },
});

test('D1 starts empty and persists completed ids as one list under the namespaced key', () => {
    const raw = memory();
    const store = createEncounterStore(raw);
    assert.equal(store.loadCompleted().size, 0);
    store.markCompleted('a');
    store.markCompleted('b');
    assert.deepEqual(JSON.parse(raw.getItem(KEYS.completed)), ['a', 'b']);
    assert.deepEqual([...createEncounterStore(raw).loadCompleted()], ['a', 'b']);
    assert.equal(KEYS.completed, 'develop4God_encounters_completed');
});

test('D3 completing the same id twice keeps one entry', () => {
    const raw = memory();
    const store = createEncounterStore(raw);
    store.markCompleted('a');
    store.markCompleted('a');
    assert.deepEqual(JSON.parse(raw.getItem(KEYS.completed)), ['a']);
});

test('markCompleted ignores empty or non-string ids', () => {
    const store = createEncounterStore(memory());
    for (const bad of ['', null, undefined, 5, {}]) store.markCompleted(bad);
    assert.equal(store.loadCompleted().size, 0);
});

test('isCompleted reflects the stored set', () => {
    const store = createEncounterStore(memory());
    store.markCompleted('a');
    assert.equal(store.isCompleted('a'), true);
    assert.equal(store.isCompleted('b'), false);
});

test('D2 a corrupt or wrongly shaped stored value is ignored and the store recovers', () => {
    for (const bad of ['{not json', '{"a":1}', '"a"', '[1,null,"ok"]']) {
        const raw = memory({ [KEYS.completed]: bad });
        const store = createEncounterStore(raw);
        assert.ok(store.loadCompleted() instanceof Set);
        store.markCompleted('x');
        assert.equal(store.isCompleted('x'), true);
    }
    assert.deepEqual([...createEncounterStore(memory({ [KEYS.completed]: '[1,null,"ok"]' })).loadCompleted()], ['ok']);
});

test('D1 blocked storage: completion lives in memory for the session and nothing throws', () => {
    const store = createEncounterStore(blocked());
    assert.doesNotThrow(() => store.markCompleted('a'));
    assert.equal(store.isCompleted('a'), true);
    assert.deepEqual([...store.loadCompleted()], ['a']);
});

test('missing storage object behaves like blocked storage', () => {
    const store = createEncounterStore(undefined);
    store.markCompleted('a');
    assert.equal(store.isCompleted('a'), true);
});

test('another tab completing an encounter is picked up on the next load', () => {
    const raw = memory();
    const store = createEncounterStore(raw);
    createEncounterStore(raw).markCompleted('z');
    assert.equal(store.isCompleted('z'), true);
});

// ---- welcome (B8): shown once per browser, set on Begin ----

test('B8 the welcome has not been seen on a fresh browser, and is remembered after markWelcomeSeen', () => {
    const raw = memory();
    const store = createEncounterStore(raw);
    assert.equal(store.hasSeenWelcome(), false);
    store.markWelcomeSeen();
    assert.equal(store.hasSeenWelcome(), true);
    assert.equal(createEncounterStore(raw).hasSeenWelcome(), true);
    assert.equal(KEYS.welcomeSeen, 'develop4God_encounters_welcome_seen');
});

test('B8 a corrupt welcome flag counts as not seen; only true counts as seen', () => {
    for (const bad of ['{x', '"yes"', '1', '0', 'null', '[]']) {
        assert.equal(createEncounterStore(memory({ [KEYS.welcomeSeen]: bad })).hasSeenWelcome(), false, bad);
    }
    assert.equal(createEncounterStore(memory({ [KEYS.welcomeSeen]: 'true' })).hasSeenWelcome(), true);
});

test('B8 blocked storage: the welcome is remembered for the session so it never loops', () => {
    const store = createEncounterStore(blocked());
    assert.equal(store.hasSeenWelcome(), false);
    store.markWelcomeSeen();
    assert.equal(store.hasSeenWelcome(), true);
});

test('B8 the welcome flag does not touch the completed list', () => {
    const raw = memory();
    const store = createEncounterStore(raw);
    store.markWelcomeSeen();
    assert.equal(store.loadCompleted().size, 0);
});

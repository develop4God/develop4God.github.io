'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// Load the real browser-IIFE sources so c8 attributes coverage to them.
global.window = global.window || {};
for (const name of ['storage-json.js', 'encounter-entitlement.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createEncounterEntitlement, KEY } = global.window.EncounterEntitlement;

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: (k) => { delete data[k]; },
    };
}

const blockedStorage = () => ({
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
});

test('the key is the one agreed in the Encounters plan (F1)', () => {
    assert.equal(KEY, 'develop4God_encounters_unlock_all');
});

test('a fresh browser is locked', () => {
    assert.equal(createEncounterEntitlement(memoryStorage()).isUnlocked(), false);
});

test('a stored true unlocks, so a payer stays unlocked on a later visit', () => {
    const storage = memoryStorage({ [KEY]: 'true' });
    assert.equal(createEncounterEntitlement(storage).isUnlocked(), true);
});

test('only a stored boolean true counts: strings, arrays, corrupt JSON and null stay locked', () => {
    for (const raw of ['"yes"', '1', '[true]', '{"a":true}', 'false', '{not json']) {
        const entitlement = createEncounterEntitlement(memoryStorage({ [KEY]: raw }));
        assert.equal(entitlement.isUnlocked(), false, `stored ${raw} must stay locked`);
    }
});

test('grant writes true to storage and unlocks at once', () => {
    const storage = memoryStorage();
    const entitlement = createEncounterEntitlement(storage);
    assert.equal(entitlement.grant(), true);
    assert.equal(storage.data[KEY], 'true');
    assert.equal(entitlement.isUnlocked(), true);
});

test('blocked storage never throws: reads are locked, and a grant still unlocks for this session', () => {
    const entitlement = createEncounterEntitlement(blockedStorage());
    assert.equal(entitlement.isUnlocked(), false);
    assert.equal(entitlement.grant(), false, 'the write reports failure');
    assert.equal(entitlement.isUnlocked(), true, 'a payer must not be locked again in this session');
});

test('a fresh instance on blocked storage stays locked after an earlier session granted nothing', () => {
    const first = createEncounterEntitlement(blockedStorage());
    assert.equal(first.isUnlocked(), false);
    const second = createEncounterEntitlement(blockedStorage());
    assert.equal(second.isUnlocked(), false);
});

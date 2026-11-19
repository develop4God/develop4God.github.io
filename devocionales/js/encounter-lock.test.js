'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'encounter-lock.js');
const source = fs.readFileSync(filename, 'utf8');
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { isUnlocked, firstLocked, prerequisiteOf } = global.window.EncounterLock;

const e = (id, status = 'published') => ({ id, status });
const index = [e('a'), e('b'), e('c'), e('soon', 'coming_soon'), e('d')];
const done = (...ids) => new Set(ids);

// Mirrors EncounterState.isUnlocked in devocional_nuevo.

test('isUnlocked: the first published encounter is always open', () => {
    assert.equal(isUnlocked(index, 'a', done()), true);
});

test('isUnlocked: the next one stays locked until the previous is completed', () => {
    assert.equal(isUnlocked(index, 'b', done()), false);
    assert.equal(isUnlocked(index, 'b', done('a')), true);
});

test('isUnlocked: completing a later one does not open an earlier gap', () => {
    assert.equal(isUnlocked(index, 'c', done('a')), false);
    assert.equal(isUnlocked(index, 'c', done('b')), true);
});

test('isUnlocked: coming_soon entries are skipped when finding the previous one', () => {
    assert.equal(isUnlocked(index, 'd', done('a', 'b')), false);
    assert.equal(isUnlocked(index, 'd', done('c')), true);
});

test('isUnlocked: a coming_soon or unknown id is treated as unlocked (own overlay handles it)', () => {
    assert.equal(isUnlocked(index, 'soon', done()), true);
    assert.equal(isUnlocked(index, 'nope', done()), true);
});

test('isUnlocked: allUnlocked skips the sequential rule', () => {
    assert.equal(isUnlocked(index, 'd', done(), true), true);
});

test('isUnlocked: bad input never throws and does not lock', () => {
    assert.equal(isUnlocked(null, 'a', done()), true);
    assert.equal(isUnlocked([], 'a', done()), true);
    assert.equal(isUnlocked(index, 'b', null), false);
    assert.equal(isUnlocked([null, { id: 'x', status: 'published' }, {}], 'x', done()), true);
});

test('firstLocked: returns the next encounter the reader will reach', () => {
    assert.equal(firstLocked(index, done()).id, 'b');
    assert.equal(firstLocked(index, done('a')).id, 'c');
});

test('firstLocked: null when everything is open or completed', () => {
    assert.equal(firstLocked(index, done('a', 'b', 'c')), null);
    assert.equal(firstLocked(index, done(), true), null);
    assert.equal(firstLocked([], done()), null);
});

test('prerequisiteOf: the previous published entry, null for the first or unknown', () => {
    assert.equal(prerequisiteOf(index, 'b').id, 'a');
    assert.equal(prerequisiteOf(index, 'd').id, 'c');
    assert.equal(prerequisiteOf(index, 'a'), null);
    assert.equal(prerequisiteOf(index, 'nope'), null);
    assert.equal(prerequisiteOf(null, 'b'), null);
});

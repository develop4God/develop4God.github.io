'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const name of ['encounter-lock.js', 'encounter-cards.js']) {
    const filename = path.join(__dirname, name);
    const source = fs.readFileSync(filename, 'utf8');
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
}
const { buildCards, countPublished } = global.window.EncounterCards;

const e = (id, over = {}) => ({ id, title: `T-${id}`, status: 'published', isPublished: true, ...over });
const soon = (id) => e(id, { status: 'coming_soon', isPublished: false });
const entries = [e('a'), e('b'), e('c'), soon('s'), e('d')];
const build = (completed = [], allUnlocked = false, list = entries) => buildCards(list, { completed: new Set(completed), allUnlocked });
const states = (cards) => Object.fromEntries(cards.map((c) => [c.id, c.state]));

test('B3 a fresh reader: first is open, the rest locked, coming_soon stays coming soon', () => {
    assert.deepEqual(states(build()), { a: 'open', b: 'locked', c: 'locked', s: 'comingSoon', d: 'locked' });
});

test('B4 completing the first opens the second, in index order (never reordered)', () => {
    const cards = build(['a']);
    assert.deepEqual(states(cards), { a: 'completed', b: 'open', c: 'locked', s: 'comingSoon', d: 'locked' });
    assert.deepEqual(cards.map((c) => c.id), ['a', 'b', 'c', 's', 'd']);
});

test('B4 a locked card names its prerequisite (the previous published title)', () => {
    const cards = build();
    assert.equal(cards[1].prerequisiteTitle, 'T-a');
    assert.equal(cards[4].prerequisiteTitle, 'T-c');
    assert.equal(cards[0].prerequisiteTitle, null);
});

test('B4 exactly one locked card is highlighted: the next one the reader will reach', () => {
    assert.deepEqual(build().filter((c) => c.isNextLocked).map((c) => c.id), ['b']);
    assert.deepEqual(build(['a']).filter((c) => c.isNextLocked).map((c) => c.id), ['c']);
    assert.deepEqual(build(['a', 'b', 'c', 'd']).filter((c) => c.isNextLocked), []);
});

test('badge A: NEXT only on the first unfinished open card, Completed on finished ones, nothing else', () => {
    const cards = build(['a']);
    assert.deepEqual(cards.map((c) => c.badge), ['completed', 'next', null, null, null]);
});

test('with the unlock-all entitlement nothing is locked and NEXT is the first unfinished card', () => {
    const cards = build([], true);
    assert.deepEqual(states(cards), { a: 'open', b: 'open', c: 'open', s: 'comingSoon', d: 'open' });
    assert.deepEqual(cards.map((c) => c.badge), ['next', null, null, null, null]);
    assert.equal(cards.some((c) => c.isNextLocked), false);
});

test('a completed card stays completed even when an earlier one is not (unlock-all, then partial progress)', () => {
    assert.equal(states(build(['c'], true)).c, 'completed');
    assert.equal(states(build(['c'])).c, 'completed');
});

test('all published completed: no NEXT badge, no locked cards', () => {
    const cards = build(['a', 'b', 'c', 'd']);
    assert.equal(cards.filter((c) => c.badge === 'next').length, 0);
    assert.equal(cards.filter((c) => c.state === 'locked').length, 0);
});

test('only coming_soon entries: nothing is open or locked', () => {
    assert.deepEqual(states(build([], false, [soon('x'), soon('y')])), { x: 'comingSoon', y: 'comingSoon' });
});

test('countPublished counts only published entries', () => {
    assert.equal(countPublished(entries), 4);
    assert.equal(countPublished([]), 0);
    assert.equal(countPublished(null), 0);
});

test('bad input never throws: no list, no completed set', () => {
    assert.deepEqual(buildCards(null, {}), []);
    assert.deepEqual(buildCards(undefined), []);
    assert.deepEqual(states(buildCards(entries, {})), { a: 'open', b: 'locked', c: 'locked', s: 'comingSoon', d: 'locked' });
    assert.deepEqual(buildCards([null, 'x', {}], { completed: new Set() }), []);
});

test('does not mutate the entries it is given', () => {
    const before = JSON.stringify(entries);
    build(['a']);
    assert.equal(JSON.stringify(entries), before);
});

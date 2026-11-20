'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const name of ['discovery-progress.js', 'encounter-lock.js', 'encounter-cards.js', 'encounter-filters.js']) {
    const filename = path.join(__dirname, name);
    const source = fs.readFileSync(filename, 'utf8');
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
}
const { buildCards } = global.window.EncounterCards;
const { normalizeFilter, filterCards, countFilters, pickHero } = global.window.EncounterFilters;

const e = (id, over = {}) => ({ id, title: `T-${id}`, status: 'published', isPublished: true, ...over });
const soon = (id) => e(id, { status: 'coming_soon', isPublished: false });
const entries = [e('a'), e('b'), e('c'), soon('s'), e('d')];
const build = (completed = [], allUnlocked = false, list = entries) => buildCards(list, { completed: new Set(completed), allUnlocked });
const withProgress = (map) => (id) => map[id] || null;


test('filters: unknown or missing filter values fall back to "all"', () => {
    assert.equal(normalizeFilter('completed'), 'completed');
    assert.equal(normalizeFilter('favorites'), 'all');
    assert.equal(normalizeFilter(undefined), 'all');
    assert.equal(normalizeFilter(null), 'all');
});

test('filters: all = published cards; pending = published and not completed; completed = completed only', () => {
    const cards = build(['a', 'c']);
    assert.deepEqual(filterCards(cards, 'all').map((c) => c.id), ['a', 'b', 'c', 's', 'd']);
    assert.deepEqual(filterCards(cards, 'pending').map((c) => c.id), ['b', 'd']);
    assert.deepEqual(filterCards(cards, 'completed').map((c) => c.id), ['a', 'c']);
});

test('filters: coming-soon cards show only under All; Pending and Completed never include them', () => {
    const cards = build();
    assert.equal(filterCards(cards, 'all').some((c) => c.id === 's'), true);
    assert.equal(filterCards(cards, 'pending').some((c) => c.id === 's'), false);
    assert.equal(filterCards(cards, 'completed').some((c) => c.id === 's'), false);
    assert.deepEqual(countFilters(cards), { all: 5, pending: 4, completed: 0 });
});

test('filters: empty list, all completed, and a filter that matches nothing', () => {
    assert.deepEqual(countFilters(build([], false, [])), { all: 0, pending: 0, completed: 0 });
    assert.deepEqual(filterCards(build([], false, []), 'pending'), []);
    const allDone = build(['a', 'b', 'c', 'd']);
    assert.deepEqual(filterCards(allDone, 'pending'), []);
    assert.deepEqual(countFilters(allDone), { all: 5, pending: 0, completed: 4 });
});

test('filters: coming-soon only leaves Pending and Completed empty', () => {
    const cards = build([], false, [soon('s1'), soon('s2')]);
    assert.deepEqual(countFilters(cards), { all: 2, pending: 0, completed: 0 });
    assert.deepEqual(filterCards(cards, 'pending'), []);
});

test('filters: filter functions do not mutate the input list', () => {
    const cards = build(['a']);
    const before = cards.map((c) => c.id).join();
    filterCards(cards, 'completed');
    filterCards(cards, 'all').pop();
    assert.equal(cards.map((c) => c.id).join(), before);
});

test('hero: is the card marked "next" (first unfinished open encounter)', () => {
    const hero = pickHero(build(['a']));
    assert.equal(hero.card.id, 'b');
    assert.equal(hero.card.badge, 'next');
});

test('hero: null when every remaining encounter is locked or everything is done', () => {
    assert.equal(pickHero(build([], false, [])), null);
    assert.equal(pickHero(build(['a', 'b', 'c', 'd'])), null);
    // Only a locked card left: nothing is open, so no hero (never a locked card).
    const onlyLocked = [e('a', { isPublished: true }), e('b')];
    const cards = buildCards(onlyLocked, { completed: new Set(), allUnlocked: false }).map((c) => ({ ...c, state: c.id === 'a' ? 'completed' : 'locked', badge: null }));
    assert.equal(pickHero(cards), null);
});


test('hero: an open card in progress is the "continue" hero with its percent', () => {
    const cards = buildCards(entries, { completed: new Set(), progressOf: withProgress({ a: { completedSections: [0], totalSections: 4 } }) });
    const hero = pickHero(cards);
    assert.equal(hero.kind, 'continue');
    assert.equal(hero.card.id, 'a');
    assert.equal(hero.card.percent, 0.25);
});

test('hero: without progress the next open card is the "start" hero', () => {
    assert.equal(pickHero(build()).kind, 'start');
});

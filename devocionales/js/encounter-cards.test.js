'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const name of ['discovery-cards.js', 'encounter-lock.js', 'encounter-cards.js']) {
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

// ---- list filter + hero (shared header with Bible studies) ----
const { normalizeFilter, filterCards, countFilters, pickHero } = global.window.EncounterCards;

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

// ---- section progress on open cards; "continue" hero (shared with Bible studies) ----
const withProgress = (map) => (id) => map[id] || null;

test('progress: only open cards get a percent; locked, completed and coming-soon cards get none', () => {
    const cards = buildCards(entries, { completed: new Set(['a']), progressOf: withProgress({ b: { completedSections: [0, 1], totalSections: 4 }, a: { completedSections: [0], totalSections: 2 } }) });
    assert.equal(cards.find((c) => c.id === 'b').percent, 0.5);
    assert.equal(cards.find((c) => c.id === 'a').percent, null);
    assert.equal(cards.find((c) => c.id === 'c').percent, null);
    assert.equal(cards.find((c) => c.id === 's').percent, null);
});

test('progress: an open card with reads but no known total shows no bar; isInProgress only with a read section', () => {
    const cards = buildCards(entries, { progressOf: withProgress({ a: { completedSections: [0], totalSections: null }, b: { completedSections: [], totalSections: 3 } }) });
    assert.equal(cards.find((c) => c.id === 'a').percent, null);
    assert.equal(cards.find((c) => c.id === 'a').isInProgress, true);
    assert.equal(cards.find((c) => c.id === 'b').isInProgress, false);
});

test('progress: no progress lookup at all (old callers) leaves every card without a bar', () => {
    assert.ok(build().every((c) => c.percent === null && c.isInProgress === false));
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

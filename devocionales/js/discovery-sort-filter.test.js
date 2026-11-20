'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const name of ['discovery-cards.js', 'discovery-sort-filter.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { buildCards, filterCards, countFilters, pickHero, normalizeFilter, FILTERS } = global.window.DiscoverySortFilter;

const study = (id) => ({ id, title: id, version: '1', emoji: '📖', subtitle: '', minutes: 5, file: `${id}.json` });
const studies = ['a', 'b', 'c', 'd'].map(study);
const progress = (map) => (id) => map[id] || { isCompleted: false, completedSections: [] };
const build = (over = {}) => buildCards(studies, {
    seen: new Set(), favorites: new Set(), progressOf: progress({}), ...over,
});
const ids = (cards) => cards.map((c) => c.id);

// ---- buildCards: badge priority (B7) and order (B8) ----

test('buildCards: an unopened, unfinished study is New', () => {
    const [a] = build();
    assert.equal(a.isNew, true);
    assert.equal(a.badge, 'new');
});

test('buildCards: opening a study (seen) clears New; no progress means no badge', () => {
    const [a] = build({ seen: new Set(['a']) });
    assert.equal(a.isNew, false);
    assert.equal(a.badge, null);
});

test('buildCards: in progress shows the In progress badge once seen', () => {
    const cards = build({
        seen: new Set(['a']),
        progressOf: progress({ a: { isCompleted: false, completedSections: [0] } }),
    });
    assert.equal(cards.find((c) => c.id === 'a').badge, 'inProgress');
});

test('buildCards: priority is Completed > New > In progress', () => {
    const p = progress({
        a: { isCompleted: true, completedSections: [0, 1] },
        b: { isCompleted: false, completedSections: [0] },
    });
    const cards = build({ progressOf: p }); // nothing seen
    const by = Object.fromEntries(cards.map((c) => [c.id, c]));
    assert.equal(by.a.badge, 'completed', 'completed beats new even if unseen');
    assert.equal(by.a.isNew, false, 'new is hidden once completed');
    assert.equal(by.b.badge, 'new', 'new beats in-progress');
    assert.equal(by.b.isInProgress, true);
});

test('buildCards: completed studies sort to the end, otherwise index order is kept', () => {
    const cards = build({ progressOf: progress({ a: { isCompleted: true, completedSections: [] }, c: { isCompleted: true, completedSections: [] } }) });
    assert.deepEqual(ids(cards), ['b', 'd', 'a', 'c']);
});

test('buildCards: favourites flag comes from the set; unknown ids in the set are ignored', () => {
    const cards = build({ favorites: new Set(['b', 'ghost']) });
    assert.deepEqual(cards.filter((c) => c.isFavorite).map((c) => c.id), ['b']);
});

test('buildCards: percent is null when the section total is unknown (B3), fraction when known, capped at 1', () => {
    const p = progress({
        a: { isCompleted: false, completedSections: [0, 1], totalSections: 4 },
        b: { isCompleted: false, completedSections: [0, 1, 2], totalSections: 2 },
        c: { isCompleted: false, completedSections: [0], totalSections: null },
    });
    const cards = build({ progressOf: p });
    const by = Object.fromEntries(cards.map((c) => [c.id, c]));
    assert.equal(by.a.percent, 0.5);
    assert.equal(by.b.percent, 1);
    assert.equal(by.c.percent, null);
});

test('buildCards: a completed study reports percent 1', () => {
    const cards = build({ progressOf: progress({ a: { isCompleted: true, completedSections: [] } }) });
    assert.equal(cards.find((c) => c.id === 'a').percent, 1);
});

test('buildCards: empty or missing inputs do not throw', () => {
    assert.deepEqual(buildCards([], { seen: new Set(), favorites: new Set(), progressOf: progress({}) }), []);
    assert.deepEqual(buildCards(null, {}), []);
    const [a] = buildCards([study('a')], {});
    assert.equal(a.isNew, true);
    assert.equal(a.isFavorite, false);
});

test('buildCards: does not mutate the input list', () => {
    const input = [study('a'), study('b')];
    buildCards(input, { progressOf: progress({ a: { isCompleted: true, completedSections: [] } }) });
    assert.deepEqual(ids(input), ['a', 'b']);
});

// ---- filters (B4) ----

test('filterCards: all / pending / completed / favourites', () => {
    const cards = build({
        favorites: new Set(['a', 'b']),
        progressOf: progress({ a: { isCompleted: true, completedSections: [] } }),
    });
    assert.deepEqual(ids(filterCards(cards, 'all')), ['b', 'c', 'd', 'a']);
    assert.deepEqual(ids(filterCards(cards, 'pending')), ['b', 'c', 'd']);
    assert.deepEqual(ids(filterCards(cards, 'completed')), ['a']);
    assert.deepEqual(ids(filterCards(cards, 'favorites')), ['b', 'a']);
});

test('filterCards: unknown filter acts as all; empty result is an empty array', () => {
    const cards = build();
    assert.equal(filterCards(cards, 'bogus').length, 4);
    assert.deepEqual(filterCards(cards, 'completed'), []);
    assert.deepEqual(filterCards([], 'all'), []);
});

test('countFilters: live counts for every chip', () => {
    const cards = build({
        favorites: new Set(['b']),
        progressOf: progress({ a: { isCompleted: true, completedSections: [] } }),
    });
    assert.deepEqual(countFilters(cards), { all: 4, pending: 3, completed: 1, favorites: 1 });
    assert.deepEqual(countFilters([]), { all: 0, pending: 0, completed: 0, favorites: 0 });
});

test('normalizeFilter: keeps valid values, defaults anything else to all', () => {
    assert.deepEqual(FILTERS, ['all', 'pending', 'completed', 'favorites']);
    for (const f of FILTERS) assert.equal(normalizeFilter(f), f);
    for (const bad of [undefined, null, '', 'ALL', 5, {}]) assert.equal(normalizeFilter(bad), 'all');
});

// ---- hero (B2, B3) ----

test('pickHero: the study in progress wins -> kind continue', () => {
    const cards = build({
        seen: new Set(['a', 'c']),
        progressOf: progress({ c: { isCompleted: false, completedSections: [0] } }),
    });
    const hero = pickHero(cards);
    assert.equal(hero.card.id, 'c');
    assert.equal(hero.kind, 'continue');
});

test('pickHero: with several in progress, the first in list order is used', () => {
    const p = progress({ b: { isCompleted: false, completedSections: [0] }, c: { isCompleted: false, completedSections: [0] } });
    assert.equal(pickHero(build({ progressOf: p })).card.id, 'b');
});

test('pickHero: first-time user gets the first unfinished study -> kind start', () => {
    const hero = pickHero(build());
    assert.equal(hero.card.id, 'a');
    assert.equal(hero.kind, 'start');
});

test('pickHero: skips completed studies when choosing where to start', () => {
    const p = progress({ a: { isCompleted: true, completedSections: [] } });
    assert.equal(pickHero(build({ progressOf: p })).card.id, 'b');
});

test('pickHero: null when everything is completed or the list is empty', () => {
    const all = progress(Object.fromEntries(['a', 'b', 'c', 'd'].map((i) => [i, { isCompleted: true, completedSections: [] }])));
    assert.equal(pickHero(build({ progressOf: all })), null);
    assert.equal(pickHero([]), null);
    assert.equal(pickHero(null), null);
});

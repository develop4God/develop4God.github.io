'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
function load(name) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
['dom-builder.js', 'discovery-card-dom.js', 'discovery-list-dom.js'].forEach(load);
const { createBuilder } = global.window.DomBuilder;
const { createCardDom } = global.window.DiscoveryCardDom;
const { createListDom } = global.window.DiscoveryListDom;

const LABELS = {
    filterAll: 'All', filterPending: 'Pending', filterCompleted: 'Completed', filterFavorites: 'Favorites',
    loading: 'Loading…', loadError: 'Could not load', retry: 'Try again', empty: 'No studies', noneFound: 'Nothing here',
    noFavoritesTitle: 'No favorites yet', noFavoritesDescription: 'Tap the star', studiesCount: '{count} studies',
};
const t = (k) => LABELS[k] || k;
const doc = new FakeDocument();
const h = createBuilder(doc);
const list = createListDom({ h, t, cardDom: createCardDom({ h, t }) });
const noop = () => {};
const card = (id) => ({ id, title: id, subtitle: '', emoji: '📖', minutes: 5, badge: null, isFavorite: false, percent: null });
const cardHandlers = { onOpen: noop, onToggleFavorite: noop, onShare: noop, onConfirmRemove: noop, onCancelRemove: noop };

test('chips: B4 four filters with live counts, the active one is pressed', () => {
    const el = list.buildChips({ all: 4, pending: 3, completed: 1, favorites: 2 }, 'pending', noop);
    const chips = el.querySelectorAll('.study-chip');
    assert.deepEqual(chips.map((c) => c.getAttribute('data-filter')), ['all', 'pending', 'completed', 'favorites']);
    assert.deepEqual(chips.map((c) => c.querySelector('.study-chip-count').textContent), ['4', '3', '1', '2']);
    assert.deepEqual(chips.map((c) => c.getAttribute('aria-pressed')), ['false', 'true', 'false', 'false']);
    assert.equal(chips[1].querySelector('.study-chip-label').textContent, 'Pending');
});

test('chips: the group has an accessible name', () => {
    const el = list.buildChips({ all: 0, pending: 0, completed: 0, favorites: 0 }, 'all', noop);
    assert.equal(el.getAttribute('aria-label'), 'title');
});

test('chips: clicking a chip reports its filter', () => {
    let chosen;
    const el = list.buildChips({ all: 0, pending: 0, completed: 0, favorites: 0 }, 'all', (f) => { chosen = f; });
    el.querySelector('[data-filter="favorites"]').click();
    assert.equal(chosen, 'favorites');
});

test('grid: one card per study in the given order, with confirming applied to one id only', () => {
    const el = list.buildGrid([card('a'), card('b'), card('c')], { confirmingId: 'b', handlers: cardHandlers });
    assert.deepEqual(el.querySelectorAll('.study-card').map((c) => c.getAttribute('data-study-id')), ['a', 'b', 'c']);
    assert.equal(el.querySelectorAll('.study-confirm').length, 1);
    assert.equal(el.querySelector('[data-study-id="b"]').querySelector('.study-confirm') !== null, true);
});

test('grid: an empty list renders an empty grid, not an error', () => {
    assert.equal(list.buildGrid([], { handlers: cardHandlers }).querySelectorAll('.study-card').length, 0);
});

test('message: A5 loading is a live status region', () => {
    const el = list.buildMessage('loading');
    assert.equal(el.getAttribute('role'), 'status');
    assert.equal(el.textContent.includes('Loading…'), true);
});

test('message: A5 error shows the text and a Retry button that calls back', () => {
    let retried = 0;
    const el = list.buildMessage('error', { onRetry: () => { retried += 1; } });
    assert.equal(el.getAttribute('role'), 'alert');
    assert.ok(el.textContent.includes('Could not load'));
    el.querySelector('.study-retry').click();
    assert.equal(retried, 1);
    assert.equal(el.querySelector('.study-retry').textContent, 'Try again');
});

test('message: A5 empty / filtered-empty / no-favourites states use their own copy', () => {
    assert.ok(list.buildMessage('empty').textContent.includes('No studies'));
    assert.ok(list.buildMessage('filtered').textContent.includes('Nothing here'));
    const fav = list.buildMessage('favorites');
    assert.ok(fav.textContent.includes('No favorites yet'));
    assert.ok(fav.textContent.includes('Tap the star'));
});

test('message: an unknown kind renders nothing', () => {
    assert.equal(list.buildMessage('bogus'), null);
});

test('countLabel: fills the {count} placeholder', () => {
    assert.equal(list.countLabel(42), '42 studies');
    assert.equal(list.countLabel(0), '0 studies');
});

// ---- shared header: generic filter chips and hero (used by Bible studies and Encounters) ----

const CHIP_ITEMS = [
    { filter: 'all', label: 'All', count: 3 },
    { filter: 'pending', label: 'Pending', count: 2 },
    { filter: 'completed', label: 'Completed', count: 1 },
];

test('buildFilterChips: renders one pressed chip per item with its label and count', () => {
    const el = list.buildFilterChips(CHIP_ITEMS, 'pending', noop);
    const chips = el.querySelectorAll('.study-chip');
    assert.deepEqual(chips.map((c) => c.getAttribute('data-filter')), ['all', 'pending', 'completed']);
    assert.deepEqual(chips.map((c) => c.querySelector('.study-chip-count').textContent), ['3', '2', '1']);
    assert.deepEqual(chips.map((c) => c.getAttribute('aria-pressed')), ['false', 'true', 'false']);
});

test('buildFilterChips: a click reports the filter of the chip that was pressed', () => {
    let chosen = null;
    const el = list.buildFilterChips(CHIP_ITEMS, 'all', (f) => { chosen = f; });
    el.querySelector('[data-filter="completed"]').click();
    assert.equal(chosen, 'completed');
});

test('buildFilterChips: no items gives an empty bar (no chips, no throw)', () => {
    assert.equal(list.buildFilterChips([], 'all', noop).querySelectorAll('.study-chip').length, 0);
});

test('buildHero: start kind shows the given label, button and no progress', () => {
    const el = list.buildHero({ label: 'Start here', buttonLabel: 'Read', card: card('a') }, { onOpen: noop });
    assert.equal(el.querySelector('.study-hero-label').textContent, 'Start here');
    assert.equal(el.querySelector('.study-hero-button').textContent, 'Read');
    assert.equal(el.querySelector('.study-hero-title').textContent, 'a');
    assert.equal(el.querySelector('[role="progressbar"]'), null);
    assert.equal(el.querySelector('.study-hero-percent'), null);
});

test('buildHero: a known percent draws the progress bar and percentage', () => {
    const el = list.buildHero({ label: 'Continue', buttonLabel: 'Go', card: card('a'), percent: 50 }, { onOpen: noop });
    assert.equal(el.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '50');
    assert.equal(el.querySelector('.study-hero-percent').textContent, '50%');
});

test('buildHero: the button calls onOpen with the card id', () => {
    let opened = null;
    const el = list.buildHero({ label: 'x', buttonLabel: 'Read', card: card('zz') }, { onOpen: (id) => { opened = id; } });
    el.querySelector('.study-hero-button').click();
    assert.equal(opened, 'zz');
});

test('buildHero: a missing subtitle renders no subtitle paragraph', () => {
    const el = list.buildHero({ label: 'x', buttonLabel: 'Read', card: card('a') }, { onOpen: noop });
    assert.equal(el.querySelector('.study-card-subtitle'), null);
});

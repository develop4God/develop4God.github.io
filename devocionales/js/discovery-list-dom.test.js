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

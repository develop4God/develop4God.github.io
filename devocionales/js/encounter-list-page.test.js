'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'discovery-cards.js', 'encounter-lock.js', 'encounter-cards.js', 'encounter-card-dom.js', 'discovery-list-dom.js', 'encounter-list-page.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createBuilder } = global.window.DomBuilder;

const TEXT = {
    studiesCount: '{count} encounters', loading: 'Loading…', loadError: 'Could not load', retry: 'Retry', empty: 'None yet',
    badge_completed: 'Completed', current: 'Current', coming_soon: 'COMING SOON', locked: 'Locked',
    complete_to_unlock: 'Complete: {title}', min_immersive_journey: 'MIN', noneFound: 'Nothing here',
};
const t = (k) => TEXT[k] || k;
const e = (id, over = {}) => ({ id, version: '1', title: `T-${id}`, subtitle: '', scripture: '', minutes: 5, emoji: '📖', accent: null, introImage: '', status: 'published', isPublished: true, releaseDate: '', file: `${id}.json`, ...over });

function setup({ index = [e('a'), e('b'), e('c')], completed = [], allUnlocked = false, loadIndex } = {}) {
    const doc = new FakeDocument();
    const h = createBuilder(doc);
    const view = { count: doc.createElement('p'), body: doc.createElement('div') };
    const state = { completed: new Set(completed), allUnlocked, sheetOpened: 0, opened: [], loads: 0 };
    const store = { loadCompleted: () => new Set(state.completed) };
    const cardDom = global.window.EncounterCardDom.createCardDom({ h, t, imageUrlFor: () => 'x' });
    const listDom = global.window.DiscoveryListDom.createListDom({ h, t, cardDom });
    const page = global.window.EncounterListPage.createListPage({
        view, t, lang: () => 'en', store, listDom,
        data: { loadIndex: loadIndex || (async () => { state.loads += 1; return index; }) },
        cards: global.window.EncounterCards,
        unlockSheet: { open: () => { state.sheetOpened += 1; } },
        allUnlocked: () => state.allUnlocked,
        unlockLabel: 'New encounter unlocked',
        onOpen: (id) => state.opened.push(id),
    });
    return { page, view, state };
}
const ids = (view) => view.body.querySelectorAll('.encounter-card').map((c) => c.getAttribute('data-encounter-id'));
const card = (view, id) => view.body.querySelector(`[data-encounter-id="${id}"]`);

test('init shows loading, then the cards in index order and the published count', async () => {
    const { page, view } = setup({ index: [e('a'), e('s', { status: 'coming_soon', isPublished: false }), e('b')] });
    const done = page.init();
    assert.equal(view.body.querySelector('.study-message').textContent, 'Loading…');
    await done;
    assert.deepEqual(ids(view), ['a', 's', 'b']);
    assert.equal(view.count.textContent, '2 encounters');
});

test('B4 locked cards are dimmed; the first is open', async () => {
    const { page, view } = setup();
    await page.init();
    assert.ok(card(view, 'a').classList.contains('encounter-card--open'));
    assert.ok(card(view, 'b').classList.contains('encounter-card--locked'));
});

test('B5 tapping a locked card opens the unlock sheet and never the encounter', async () => {
    const { page, view, state } = setup();
    await page.init();
    card(view, 'b').querySelector('.study-card-open').click();
    assert.equal(state.sheetOpened, 1);
    assert.deepEqual(state.opened, []);
});

test('tapping an open card opens that encounter', async () => {
    const { page, view, state } = setup();
    await page.init();
    card(view, 'a').querySelector('.study-card-open').click();
    assert.deepEqual(state.opened, ['a']);
    assert.equal(state.sheetOpened, 0);
});

test('A5 a failed load shows the error with Retry, and Retry loads again', async () => {
    let attempts = 0;
    const { page, view } = setup({ loadIndex: async () => { attempts += 1; if (attempts === 1) throw new Error('offline'); return [e('a')]; } });
    await page.init();
    assert.equal(view.body.querySelector('.study-message').getAttribute('role'), 'alert');
    view.body.querySelector('.study-retry').click();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(ids(view), ['a']);
});

test('A5 an empty index shows the empty state and no count', async () => {
    const { page, view } = setup({ index: [] });
    await page.init();
    assert.equal(view.body.querySelector('.study-message').textContent, 'None yet');
    assert.equal(view.count.textContent, '');
});

test('B6 coming back after completing one: the next card opens and plays the unlock highlight once', async () => {
    const { page, view, state } = setup();
    await page.init();
    assert.ok(card(view, 'b').classList.contains('encounter-card--locked'));
    state.completed.add('a');
    page.refresh();
    assert.ok(card(view, 'b').classList.contains('encounter-card--open'));
    assert.ok(card(view, 'b').classList.contains('is-just-unlocked'));
    assert.ok(!card(view, 'c').classList.contains('is-just-unlocked'));
    page.refresh();
    assert.ok(!card(view, 'b').classList.contains('is-just-unlocked'));
});

test('the first render never plays the unlock highlight', async () => {
    const { page, view } = setup({ completed: ['a'] });
    await page.init();
    assert.equal(view.body.querySelectorAll('.is-just-unlocked').length, 0);
});

test('refresh before the index is loaded is a no-op and never throws', () => {
    const { page, view } = setup();
    assert.doesNotThrow(() => page.refresh());
    assert.equal(view.body.children.length, 0);
});

test('F1 with the unlock-all entitlement nothing is locked', async () => {
    const { page, view } = setup({ allUnlocked: true });
    await page.init();
    assert.equal(view.body.querySelectorAll('.encounter-card--locked').length, 0);
});

test('a newer reload supersedes a slower earlier one (rapid language switches)', async () => {
    let call = 0; const resolvers = [];
    const { page, view } = setup({ loadIndex: () => new Promise((resolve) => { resolvers[call] = resolve; call += 1; }) });
    const first = page.reload();
    const second = page.reload();
    resolvers[1]([e('new')]);
    await second;
    resolvers[0]([e('old')]);
    await first;
    assert.deepEqual(ids(view), ['new']);
});

test('one card unlocked: it gets the single-unlock flash and the pill label, never the bulk sweep', async () => {
    const { page, view, state } = setup();
    await page.init();
    state.completed.add('a');
    page.refresh();
    assert.ok(card(view, 'b').classList.contains('is-just-unlocked'));
    assert.equal(card(view, 'b').getAttribute('data-unlock-label'), 'New encounter unlocked');
    assert.equal(view.body.querySelectorAll('.is-bulk-unlocked').length, 0);
});

test('several cards unlock at once (unlock all): each gets the bulk sweep and no pill', async () => {
    const { page, view, state } = setup({ allUnlocked: false });
    await page.init();
    state.completed.add('a');
    state.allUnlocked = true;
    page.refresh();
    const bulk = view.body.querySelectorAll('.is-bulk-unlocked');
    assert.deepEqual(bulk.map((el) => el.getAttribute('data-encounter-id')), ['b', 'c']);
    assert.equal(view.body.querySelectorAll('.is-just-unlocked').length, 0);
    assert.equal(view.body.querySelectorAll('[data-unlock-label]').length, 0);
});

// ---- shared header: hero + filter chips above the grid ----

const HEADER_LABELS = { startHere: 'Start here', read: 'Read', filterAll: 'All', filterPending: 'Pending', filterCompleted: 'Completed' };

function setupHeader({ index = [e('a'), e('b'), e('c')], completed = [], session = {}, withHeader = true } = {}) {
    const doc = new FakeDocument();
    const h = createBuilder(doc);
    const view = { count: doc.createElement('p'), body: doc.createElement('div') };
    if (withHeader) { view.hero = doc.createElement('div'); view.chips = doc.createElement('div'); }
    const state = { completed: new Set(completed), opened: [] };
    const store = { loadCompleted: () => new Set(state.completed) };
    const storage = { data: { ...session }, getItem(k) { return k in this.data ? this.data[k] : null; }, setItem(k, v) { this.data[k] = v; } };
    const cardDom = global.window.EncounterCardDom.createCardDom({ h, t, imageUrlFor: () => 'x' });
    const listDom = global.window.DiscoveryListDom.createListDom({ h, t, cardDom });
    const page = global.window.EncounterListPage.createListPage({
        view, t, lang: () => 'en', store, listDom,
        data: { loadIndex: async () => index },
        cards: global.window.EncounterCards,
        unlockSheet: { open() {} },
        allUnlocked: () => false,
        unlockLabel: 'New encounter unlocked',
        onOpen: (id) => state.opened.push(id),
        labels: HEADER_LABELS,
        sessionStorage: storage,
    });
    return { page, view, state, storage };
}
const chip = (view, f) => view.chips.querySelector(`[data-filter="${f}"]`);

test('header: shows the next encounter as the hero and one chip per filter with counts', async () => {
    const { page, view } = setupHeader({ completed: ['a'] });
    await page.init();
    assert.equal(view.hero.querySelector('.study-hero-title').textContent, 'T-b');
    assert.equal(view.hero.querySelector('.study-hero-label').textContent, 'Start here');
    assert.deepEqual(view.chips.querySelectorAll('.study-chip').map((c) => c.querySelector('.study-chip-count').textContent), ['3', '2', '1']);
});

test('header: clicking a chip filters the grid and remembers the choice for the session', async () => {
    const { page, view, storage } = setupHeader({ completed: ['a'] });
    await page.init();
    chip(view, 'completed').click();
    assert.deepEqual(ids(view), ['a']);
    assert.equal(chip(view, 'completed').getAttribute('aria-pressed'), 'true');
    assert.equal(storage.data.encounterFilter, 'completed');
});

test('header: the saved filter is restored on a new page load; an unknown saved value falls back to all', async () => {
    const restored = setupHeader({ completed: ['a'], session: { encounterFilter: 'pending' } });
    await restored.page.init();
    assert.deepEqual(ids(restored.view), ['b', 'c']);
    const junk = setupHeader({ session: { encounterFilter: 'favorites' } });
    await junk.page.init();
    assert.equal(chip(junk.view, 'all').getAttribute('aria-pressed'), 'true');
    assert.equal(ids(junk.view).length, 3);
});

test('header: a filter with nothing in it shows the "none found" message, not an empty grid', async () => {
    const { page, view } = setupHeader({ completed: ['a', 'b', 'c'], session: { encounterFilter: 'pending' } });
    await page.init();
    assert.equal(view.body.querySelectorAll('.encounter-card').length, 0);
    assert.equal(view.body.querySelector('.study-message').textContent, 'Nothing here');
});

test('header: no hero when every encounter is done; the hero is cleared when the index is empty', async () => {
    const done = setupHeader({ completed: ['a', 'b', 'c'] });
    await done.page.init();
    assert.equal(done.view.hero.querySelectorAll('.study-hero').length, 0);
    const empty = setupHeader({ index: [] });
    await empty.page.init();
    assert.equal(empty.view.hero.querySelectorAll('.study-hero').length, 0);
    assert.equal(empty.view.chips.querySelectorAll('.study-chip').length, 0);
});

test('header: an older cached page without the hero/chips containers still renders the grid', async () => {
    const { page, view } = setupHeader({ withHeader: false });
    await page.init();
    assert.deepEqual(ids(view), ['a', 'b', 'c']);
});

test('header: the unlock flash still plays when the newly opened card is visible under the filter', async () => {
    const { page, view, state } = setupHeader({ completed: [], session: {} });
    await page.init();
    state.completed.add('a');
    page.refresh();
    assert.ok(card(view, 'b').classList.contains('is-just-unlocked'));
});

test('header: a card unlocked while a filter hides it does not flash or throw', async () => {
    const { page, view, state } = setupHeader({ completed: [], session: { encounterFilter: 'completed' } });
    await page.init();
    state.completed.add('a');
    page.refresh();
    assert.deepEqual(ids(view), ['a']);
    assert.equal(view.body.querySelectorAll('.is-just-unlocked').length, 0);
});

// ---- section progress on the list: bar on the open card, "Continue" hero with its percent ----
function setupProgressList(sectionsById) {
    const doc = new FakeDocument();
    const h = createBuilder(doc);
    const view = { count: doc.createElement('p'), hero: doc.createElement('div'), chips: doc.createElement('div'), body: doc.createElement('div') };
    const store = { loadCompleted: () => new Set() };
    const progress = {
        getProgress: (id) => (sectionsById[id] ? { completedSections: sectionsById[id].sections, totalSections: sectionsById[id].total } : { completedSections: [], totalSections: null }),
    };
    const cardDom = global.window.EncounterCardDom.createCardDom({ h, t, imageUrlFor: () => 'x' });
    const listDom = global.window.DiscoveryListDom.createListDom({ h, t, cardDom });
    const page = global.window.EncounterListPage.createListPage({
        view, t, lang: () => 'en', store, listDom,
        data: { loadIndex: async () => [e('a'), e('b')] },
        cards: global.window.EncounterCards,
        unlockSheet: { open() {} },
        allUnlocked: () => false,
        unlockLabel: 'x',
        onOpen() {},
        labels: { ...HEADER_LABELS, continueWhereLeft: 'Continue where you left off', continueBtn: 'Continue' },
        sessionStorage: { getItem: () => null, setItem() {} },
        progress,
    });
    return { page, view };
}

test('progress: the open card shows its section bar; the card without reads shows none', async () => {
    const { page, view } = setupProgressList({ a: { sections: [0], total: 4 } });
    await page.init();
    const bar = card(view, 'a').querySelector('[role="progressbar"]');
    assert.equal(bar.getAttribute('aria-valuenow'), '25');
    assert.equal(card(view, 'b').querySelector('[role="progressbar"]'), null);
});

test('progress: an open card in progress becomes the "Continue" hero with its percentage', async () => {
    const { page, view } = setupProgressList({ a: { sections: [0], total: 4 } });
    await page.init();
    assert.equal(view.hero.querySelector('.study-hero-label').textContent, 'Continue where you left off');
    assert.equal(view.hero.querySelector('.study-hero-button').textContent, 'Continue');
    assert.equal(view.hero.querySelector('.study-hero-percent').textContent, '25%');
});

test('progress: with no progress the hero stays "Start here" and has no percentage', async () => {
    const { page, view } = setupProgressList({});
    await page.init();
    assert.equal(view.hero.querySelector('.study-hero-label').textContent, 'Start here');
    assert.equal(view.hero.querySelector('.study-hero-percent'), null);
});

test('review: an older cached page with no header ignores a saved filter, so no hidden filter can stick', async () => {
    const { page, view } = setupHeader({ withHeader: false, session: { encounterFilter: 'completed' }, completed: ['a'] });
    await page.init();
    assert.deepEqual(ids(view), ['a', 'b', 'c']);
});

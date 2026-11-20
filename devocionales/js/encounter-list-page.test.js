'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'encounter-lock.js', 'encounter-cards.js', 'encounter-card-dom.js', 'discovery-list-dom.js', 'encounter-list-page.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createBuilder } = global.window.DomBuilder;

const TEXT = {
    studiesCount: '{count} encounters', loading: 'Loading…', loadError: 'Could not load', retry: 'Retry', empty: 'None yet',
    badge_completed: 'Completed', current: 'Current', coming_soon: 'COMING SOON', locked: 'Locked',
    complete_to_unlock: 'Complete: {title}', min_immersive_journey: 'MIN',
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

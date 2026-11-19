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
['dom-builder.js', 'discovery-data.js', 'discovery-store.js', 'discovery-sort-filter.js', 'discovery-card-dom.js',
    'discovery-list-dom.js', 'discovery-cards.js', 'discovery-share-text.js', 'discovery-list-page.js'].forEach(load);
const W = global.window;
const { createListPage } = W.DiscoveryListPage;

const LABELS = {
    filterAll: 'All', filterPending: 'Pending', filterCompleted: 'Completed', filterFavorites: 'Favorites',
    loading: 'Loading', loadError: 'Load error', retry: 'Retry', empty: 'No studies', noneFound: 'None found',
    noFavoritesTitle: 'No favorites', noFavoritesDescription: 'Tap star', studiesCount: '{count} studies',
    addedFavorite: 'Added', removedFavorite: 'Removed', copied: 'Copied', shareError: 'Share error',
    eyebrow: 'Study', minutes: 'min', removeConfirm: 'Remove?', removeYes: 'Yes', cancel: 'Cancel',
    badgeNew: 'New', badgeCompleted: 'Completed', badgeCurrent: 'Current', favorite: 'Fav', share: 'Share', read: 'Read',
    continueBtn: 'Continue', continueWhereLeft: 'Continue where', startHere: 'Start here', revelation: 'Rev',
    reflectionQuestions: 'Q', shareFooterDownload: 'DL', shareFooterBenefits: 'Free', shareFooterDeveloper: 'Dev',
};
const t = (k) => LABELS[k] || k;

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}

const idx = (ids) => ids.map((id) => ({ id, version: '1', emoji: '📖', title: id.toUpperCase(), subtitle: '', minutes: 5, file: `${id}.json` }));

function setup({ studies = idx(['a', 'b', 'c']), loadIndex, loadStudy, share, lang = 'en', storage = memoryStorage(), session = memoryStorage() } = {}) {
    const doc = new FakeDocument();
    const view = { count: doc.createElement('p'), hero: doc.createElement('div'), chips: doc.createElement('div'), body: doc.createElement('div') };
    const toasts = [];
    const opened = [];
    const shared = [];
    const page = createListPage({
        view,
        h: W.DomBuilder.createBuilder(doc),
        t,
        lang: () => lang,
        data: {
            loadIndex: loadIndex || (async () => studies),
            loadStudy: loadStudy || (async (s) => ({ emoji: '📖', subtitle: '', key_verse: { reference: 'R 1:1', text: 'v' }, cards: [], id: s.id })),
        },
        store: W.DiscoveryStore.createDiscoveryStore(storage),
        sessionStorage: session,
        sortFilter: W.DiscoverySortFilter,
        cardDomFactory: W.DiscoveryCardDom.createCardDom,
        listDomFactory: W.DiscoveryListDom.createListDom,
        shareText: W.DiscoveryShareText,
        playStoreUrl: 'https://play.test',
        shareOrCopy: share || (async (nav, payload) => { shared.push(payload); return 'shared'; }),
        navigator: {},
        toast: { show: (msg, opts) => toasts.push({ msg, kind: opts && opts.kind }) },
        onOpen: (id) => opened.push(id),
    });
    return { page, view, toasts, opened, shared, storage, session };
}

const cardIds = (view) => view.body.querySelectorAll('.study-card').map((c) => c.getAttribute('data-study-id'));

test('init: shows loading, then the grid, the count and the chips (A5, B1, B4)', async () => {
    const { page, view } = setup();
    const p = page.init();
    assert.ok(view.body.textContent.includes('Loading'));
    await p;
    assert.deepEqual(cardIds(view), ['a', 'b', 'c']);
    assert.equal(view.count.textContent, '3 studies');
    assert.equal(view.chips.querySelectorAll('.study-chip').length, 4);
});

test('init: A5 a failing index shows the error with Retry, and Retry reloads', async () => {
    let fail = true;
    const { page, view } = setup({ loadIndex: async () => { if (fail) throw new Error('offline'); return idx(['a']); } });
    await page.init();
    assert.ok(view.body.textContent.includes('Load error'));
    fail = false;
    view.body.querySelector('.study-retry').click();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(cardIds(view), ['a']);
});

test('init: A5 zero studies shows the empty state and no chips or hero', async () => {
    const { page, view } = setup({ studies: [] });
    await page.init();
    assert.ok(view.body.textContent.includes('No studies'));
    assert.equal(view.chips.querySelectorAll('.study-chip').length, 0);
    assert.equal(view.hero.querySelectorAll('.study-hero').length, 0);
});

test('hero: first-time user gets "Start here" on the first study (B2, B3)', async () => {
    const { page, view } = setup();
    await page.init();
    assert.equal(view.hero.querySelector('.study-hero-label').textContent, 'Start here');
    assert.equal(view.hero.querySelector('.study-hero-percent'), null);
});

test('hero: a study in progress with a known total shows its percentage', async () => {
    const storage = memoryStorage();
    const { page, view } = setup({ storage });
    const store = W.DiscoveryStore.createDiscoveryStore(storage);
    store.setTotalSections('b', 14, 'en');
    for (let i = 0; i < 7; i++) store.markSectionCompleted('b', i, 'en');
    await page.init();
    assert.equal(view.hero.querySelector('.study-hero-label').textContent, 'Continue where');
    assert.equal(view.hero.querySelector('.study-hero-percent').textContent, '50%');
});

test('hero: hidden when every study is completed; completed studies sort last (B8)', async () => {
    const storage = memoryStorage();
    const store = W.DiscoveryStore.createDiscoveryStore(storage);
    store.completeStudy('a', 'en');
    const one = setup({ storage });
    await one.page.init();
    assert.deepEqual(cardIds(one.view), ['b', 'c', 'a']);
    ['b', 'c'].forEach((id) => store.completeStudy(id, 'en'));
    const all = setup({ storage });
    await all.page.init();
    assert.equal(all.view.hero.querySelectorAll('.study-hero').length, 0);
});

test('filters: choosing a chip filters the grid, keeps the choice in the session and shows the friendly empty state', async () => {
    const { page, view, session } = setup();
    await page.init();
    view.chips.querySelector('[data-filter="completed"]').click();
    assert.equal(cardIds(view).length, 0);
    assert.ok(view.body.textContent.includes('None found'));
    assert.equal(session.data.discoveryFilter, 'completed');
    view.chips.querySelector('[data-filter="favorites"]').click();
    assert.ok(view.body.textContent.includes('No favorites'));
});

test('filters: the stored session filter is restored; junk falls back to all', async () => {
    const restored = setup({ session: memoryStorage({ discoveryFilter: 'pending' }) });
    await restored.page.init();
    assert.equal(restored.view.chips.querySelector('[aria-pressed="true"]').getAttribute('data-filter'), 'pending');
    const junk = setup({ session: memoryStorage({ discoveryFilter: 'bogus' }) });
    await junk.page.init();
    assert.equal(junk.view.chips.querySelector('[aria-pressed="true"]').getAttribute('data-filter'), 'all');
});

test('favourite: adding toasts immediately; removing asks first, then toasts (B9)', async () => {
    const { page, view, toasts } = setup();
    await page.init();
    view.body.querySelector('[data-study-id="a"] .study-fav').click();
    assert.deepEqual(toasts.map((x) => x.msg), ['Added']);
    assert.equal(view.body.querySelector('[data-study-id="a"] .study-fav').getAttribute('aria-pressed'), 'true');
    view.body.querySelector('[data-study-id="a"] .study-fav').click();
    assert.equal(toasts.length, 1, 'nothing removed yet');
    assert.ok(view.body.querySelector('[data-study-id="a"] .study-confirm'));
    view.body.querySelector('.study-confirm-yes').click();
    assert.deepEqual(toasts.map((x) => x.msg), ['Added', 'Removed']);
    assert.equal(view.body.querySelector('.study-confirm'), null);
    assert.equal(view.body.querySelector('[data-study-id="a"] .study-fav').getAttribute('aria-pressed'), 'false');
});

test('favourite: cancelling the confirmation keeps the favourite and shows no toast', async () => {
    const { page, view, toasts } = setup();
    await page.init();
    view.body.querySelector('[data-study-id="a"] .study-fav').click();
    view.body.querySelector('[data-study-id="a"] .study-fav').click();
    view.body.querySelector('.study-confirm-no').click();
    assert.equal(view.body.querySelector('.study-confirm'), null);
    assert.equal(view.body.querySelector('[data-study-id="a"] .study-fav').getAttribute('aria-pressed'), 'true');
    assert.equal(toasts.length, 1);
});

test('favourite: counts on the chips update live', async () => {
    const { page, view } = setup();
    await page.init();
    view.body.querySelector('[data-study-id="a"] .study-fav').click();
    assert.equal(view.chips.querySelector('[data-filter="favorites"] .study-chip-count').textContent, '1');
});

test('open: marks the study seen (New clears) and notifies the host (B7)', async () => {
    const storage = memoryStorage();
    const { page, view, opened } = setup({ storage });
    await page.init();
    assert.ok(view.body.querySelector('[data-study-id="a"] .badge-new'));
    view.body.querySelector('[data-study-id="a"] .study-card-open').click();
    assert.deepEqual(opened, ['a']);
    assert.ok(JSON.parse(storage.data.discovery_seen_studies).includes('a'));
});

test('share: loads the study, builds the app summary text and shares it (B10)', async () => {
    const { page, view, shared, toasts } = setup();
    await page.init();
    view.body.querySelector('[data-study-id="a"] .study-share').click();
    await new Promise((r) => setImmediate(r));
    assert.equal(shared.length, 1);
    assert.ok(shared[0].text.includes('R 1:1'));
    assert.ok(shared[0].text.includes('https://play.test'));
    assert.equal(toasts.length, 0, 'the native share sheet is its own feedback');
});

test('share: clipboard fallback toasts "copied"; failure and a failing study load toast an error', async () => {
    const copied = setup({ share: async () => 'copied' });
    await copied.page.init();
    copied.view.body.querySelector('.study-share').click();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(copied.toasts, [{ msg: 'Copied', kind: undefined }]);

    const failed = setup({ share: async () => 'failed' });
    await failed.page.init();
    failed.view.body.querySelector('.study-share').click();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(failed.toasts, [{ msg: 'Share error', kind: 'error' }]);

    const noStudy = setup({ loadStudy: async () => { throw new Error('offline'); } });
    await noStudy.page.init();
    noStudy.view.body.querySelector('.study-share').click();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(noStudy.toasts, [{ msg: 'Share error', kind: 'error' }]);
});

test('share: a cancelled share sheet shows nothing', async () => {
    const { page, view, toasts } = setup({ share: async () => 'cancelled' });
    await page.init();
    view.body.querySelector('.study-share').click();
    await new Promise((r) => setImmediate(r));
    assert.equal(toasts.length, 0);
});

test('reload: a language change reloads the list for the new language', async () => {
    let lang = 'en';
    const requested = [];
    const doc = new FakeDocument();
    const view = { count: doc.createElement('p'), hero: doc.createElement('div'), chips: doc.createElement('div'), body: doc.createElement('div') };
    const page = createListPage({
        view, h: W.DomBuilder.createBuilder(doc), t, lang: () => lang,
        data: { loadIndex: async (l) => { requested.push(l); return idx(['a']); }, loadStudy: async () => ({}) },
        store: W.DiscoveryStore.createDiscoveryStore(memoryStorage()), sessionStorage: memoryStorage(),
        sortFilter: W.DiscoverySortFilter, cardDomFactory: W.DiscoveryCardDom.createCardDom, listDomFactory: W.DiscoveryListDom.createListDom,
        shareText: W.DiscoveryShareText, playStoreUrl: '', shareOrCopy: async () => 'shared', navigator: {}, toast: { show() {} }, onOpen() {},
    });
    await page.init();
    lang = 'es';
    await page.reload();
    assert.deepEqual(requested, ['en', 'es']);
});

test('reload: results of a superseded load never overwrite the newer one (rapid language switches)', async () => {
    const resolvers = [];
    const { page, view } = setup({ loadIndex: () => new Promise((r) => resolvers.push(r)) });
    const first = page.init();
    const second = page.reload();
    resolvers[1](idx(['new']));
    await second;
    resolvers[0](idx(['old']));
    await first;
    assert.deepEqual(cardIds(view), ['new']);
});

test('refresh: re-renders from the stores without reloading the index (storage changed elsewhere)', async () => {
    let loads = 0;
    const storage = memoryStorage();
    const { page, view } = setup({ storage, loadIndex: async () => { loads += 1; return idx(['a', 'b']); } });
    await page.init();
    assert.ok(view.body.querySelector('[data-study-id="a"] .badge-new'));
    W.DiscoveryStore.createDiscoveryStore(storage).markSeen('a');
    page.refresh();
    assert.equal(view.body.querySelector('[data-study-id="a"] .badge-new'), null);
    assert.equal(loads, 1);
});

test('refresh: before any study is loaded it keeps the current message instead of throwing', async () => {
    const { page } = setup({ loadIndex: () => new Promise(() => {}) });
    page.init();
    assert.doesNotThrow(() => page.refresh());
});

test('focus: after toggling a chip or a favourite, focus returns to the equivalent new control', async () => {
    const { page, view } = setup();
    await page.init();
    const doc = view.body.ownerDocument;
    view.chips.querySelector('[data-filter="pending"]').focus();
    view.chips.querySelector('[data-filter="pending"]').click();
    assert.equal(doc.activeElement, view.chips.querySelector('[data-filter="pending"]'), 'focus is on the NEW chip, not the destroyed one');
    view.chips.querySelector('[data-filter="all"]').click();
    const star = view.body.querySelector('[data-study-id="b"] .study-fav');
    star.focus();
    star.click();
    assert.equal(doc.activeElement, view.body.querySelector('[data-study-id="b"] .study-fav'));
});

test('focus: the removal confirmation takes focus on Yes, and Cancel returns focus to the star', async () => {
    const { page, view } = setup();
    await page.init();
    const doc = view.body.ownerDocument;
    view.body.querySelector('[data-study-id="a"] .study-fav').click();
    view.body.querySelector('[data-study-id="a"] .study-fav').click();
    assert.equal(doc.activeElement, view.body.querySelector('.study-confirm-yes'));
    view.body.querySelector('.study-confirm-no').click();
    assert.equal(doc.activeElement, view.body.querySelector('[data-study-id="a"] .study-fav'));
});

test('share: the language is captured once at click time', async () => {
    let calls = 0;
    const seen = [];
    const doc = new FakeDocument();
    const view = { count: doc.createElement('p'), hero: doc.createElement('div'), chips: doc.createElement('div'), body: doc.createElement('div') };
    const page = createListPage({
        view, h: W.DomBuilder.createBuilder(doc), t, lang: () => { calls += 1; return calls > 3 ? 'es' : 'en'; },
        data: { loadIndex: async () => idx(['a']), loadStudy: async (s, l) => { seen.push(l); return {}; } },
        store: W.DiscoveryStore.createDiscoveryStore(memoryStorage()), sessionStorage: memoryStorage(),
        sortFilter: W.DiscoverySortFilter, cardDomFactory: W.DiscoveryCardDom.createCardDom, listDomFactory: W.DiscoveryListDom.createListDom,
        shareText: W.DiscoveryShareText, playStoreUrl: '', shareOrCopy: async () => 'shared', navigator: {}, toast: { show() {} }, onOpen() {},
    });
    await page.init();
    calls = 10; // every later lang() call would now answer 'es'
    view.body.querySelector('.study-share').click();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(seen, ['es'], 'one consistent value is used for the whole share');
});

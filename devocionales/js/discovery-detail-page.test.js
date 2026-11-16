'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'discovery-cards.js', 'discovery-store.js', 'discovery-nav.js', 'discovery-card-dom.js',
    'discovery-list-dom.js', 'discovery-detail-dom.js', 'discovery-copyright.js', 'discovery-detail-page.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const W = global.window;

const LABELS = {
    previous: 'Previous', next: 'Next', exit: 'Exit', markCompleted: 'Complete study', completedStudy: 'Study completed',
    studyCompleted: 'Study completed successfully', studyNotFound: 'Study not found.', title: 'Bible Studies',
    loading: 'Loading', loadError: 'Load error', retry: 'Retry', keyVerse: 'KEY VERSE',
};
const t = (k) => LABELS[k] || k;

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}

const summary = { id: 'love', version: '1', title: 'Love', subtitle: 'Sub', emoji: '🧎', minutes: 5, file: 'love.json' };
const study = (cards = 3) => ({
    version: 'KJ2000',
    key_verse: { reference: 'J 1:1', text: 'verse' },
    cards: Array.from({ length: cards }, (_, i) => ({ order: i + 1, type: 'x', title: `Card ${i + 1}`, content: `body ${i + 1}` })),
});

function setup({ loadStudy, storage = memoryStorage(), rtl = false, copyrightFor } = {}) {
    const doc = new FakeDocument();
    const root = doc.createElement('div');
    const h = W.DomBuilder.createBuilder(doc);
    const toasts = [];
    const exits = [];
    const scrolls = [];
    const store = W.DiscoveryStore.createDiscoveryStore(storage);
    const cardDom = W.DiscoveryCardDom.createCardDom({ h, t });
    const page = W.DiscoveryDetailPage.createDetailPage({
        view: { root },
        h, t,
        lang: () => 'en',
        rtl: () => rtl,
        data: { loadStudy: loadStudy || (async () => study()) },
        store,
        detailDomFactory: W.DiscoveryDetailDom.createDetailDom,
        listDom: W.DiscoveryListDom.createListDom({ h, t, cardDom }),
        nav: W.DiscoveryNav,
        copyright: { resolve: copyrightFor || ((lang, version) => `copyright:${lang}:${version}`) },
        toast: { show: (m) => toasts.push(m) },
        onExit: () => exits.push(1),
        scrollToTop: () => scrolls.push(1),
    });
    return { page, root, store, storage, toasts, exits, scrolls };
}

const title = (root) => root.querySelector('.study-page-title') && root.querySelector('.study-page-title').textContent;

test('open: shows loading, then the study header, the key verse page first, and marks the study seen (B7, C1)', async () => {
    const { page, root, storage } = setup();
    const p = page.open(summary);
    assert.ok(root.textContent.includes('Loading'));
    await p;
    assert.equal(root.querySelector('.study-detail-title').textContent, 'Love');
    assert.ok(root.querySelector('.study-page-keyverse'));
    assert.equal(root.querySelectorAll('.study-seg').length, 4);
    assert.ok(JSON.parse(storage.data.discovery_seen_studies).includes('love'));
});

test('open: stores the card count for the list percentage (7/14 = 50%)', async () => {
    const { page, store } = setup({ loadStudy: async () => study(14) });
    await page.open(summary);
    assert.equal(store.getProgress('love', 'en').totalSections, 14);
});

test('next / prev page through the cards and mark each viewed card as a completed section', async () => {
    const { page, root, store, scrolls } = setup();
    await page.open(summary);
    root.querySelector('.study-next').click();
    assert.equal(title(root), 'Card 1');
    root.querySelector('.study-next').click();
    assert.equal(title(root), 'Card 2');
    root.querySelector('.study-prev').click();
    assert.equal(title(root), 'Card 1');
    assert.deepEqual(store.getProgress('love', 'en').completedSections, [0, 1]);
    assert.ok(scrolls.length >= 3, 'each page change scrolls to the top');
});

test('paging past the ends is a no-op', async () => {
    const { page, root } = setup();
    await page.open(summary);
    page.prev();
    assert.ok(root.querySelector('.study-page-keyverse'));
    for (let i = 0; i < 10; i++) page.next();
    assert.equal(title(root), 'Card 3');
    assert.equal(root.querySelector('.study-next'), null);
});

test('C2 keyboard arrows and swipes page; RTL mirrors them', async () => {
    const ltr = setup();
    await ltr.page.open(summary);
    ltr.page.onKey('ArrowRight');
    assert.equal(title(ltr.root), 'Card 1');
    ltr.page.onSwipe({ dx: 90, dy: 0 });
    assert.ok(ltr.root.querySelector('.study-page-keyverse'));
    ltr.page.onSwipe({ dx: -90, dy: 3 });
    assert.equal(title(ltr.root), 'Card 1');
    ltr.page.onKey('Enter');
    ltr.page.onSwipe({ dx: -10, dy: 0 });
    assert.equal(title(ltr.root), 'Card 1');

    const rtl = setup({ rtl: true });
    await rtl.page.open(summary);
    rtl.page.onKey('ArrowLeft');
    assert.equal(title(rtl.root), 'Card 1');
    rtl.page.onSwipe({ dx: 90, dy: 0 });
    assert.equal(title(rtl.root), 'Card 2');
});

test('last page: shows the footer with the completion button and the study version copyright (C4, C5)', async () => {
    const { page, root } = setup();
    await page.open(summary);
    page.goTo(3);
    assert.ok(root.querySelector('.study-complete'));
    assert.equal(root.querySelector('.study-copyright').textContent, 'copyright:en:KJ2000');
    page.goTo(1);
    assert.equal(root.querySelector('.study-complete'), null);
});

test('C4 completing marks the study done, toasts, and the button becomes a disabled "Study completed"', async () => {
    const { page, root, store, toasts } = setup();
    await page.open(summary);
    page.goTo(3);
    root.querySelector('.study-complete').click();
    assert.equal(store.getProgress('love', 'en').isCompleted, true);
    assert.deepEqual(toasts, ['Study completed successfully']);
    assert.equal(root.querySelector('.study-complete').textContent, 'Study completed');
    assert.equal(root.querySelector('.study-complete').hasAttribute('disabled'), true);
});

test('an already completed study opens with the disabled button and does not toast again', async () => {
    const storage = memoryStorage();
    W.DiscoveryStore.createDiscoveryStore(storage).completeStudy('love', 'en');
    const { page, root, toasts } = setup({ storage });
    await page.open(summary);
    page.goTo(3);
    assert.equal(root.querySelector('.study-complete').hasAttribute('disabled'), true);
    assert.deepEqual(toasts, []);
});

test('resume: reopening starts at the first unread card instead of the beginning', async () => {
    const storage = memoryStorage();
    const seed = W.DiscoveryStore.createDiscoveryStore(storage);
    seed.markSectionCompleted('love', 0, 'en');
    seed.markSectionCompleted('love', 1, 'en');
    const { page, root } = setup({ storage });
    await page.open(summary);
    assert.equal(title(root), 'Card 3');
});

test('resume: a fully read or never read study starts at the first page', async () => {
    const storage = memoryStorage();
    const seed = W.DiscoveryStore.createDiscoveryStore(storage);
    [0, 1, 2].forEach((i) => seed.markSectionCompleted('love', i, 'en'));
    const { page, root } = setup({ storage });
    await page.open(summary);
    assert.ok(root.querySelector('.study-page-keyverse'));
});

test('exit calls the host; a failing load shows the error with Retry that reloads (A5)', async () => {
    let fail = true;
    const { page, root, exits } = setup({ loadStudy: async () => { if (fail) throw new Error('offline'); return study(); } });
    await page.open(summary);
    assert.ok(root.textContent.includes('Load error'));
    fail = false;
    root.querySelector('.study-retry').click();
    await new Promise((r) => setImmediate(r));
    assert.ok(root.querySelector('.study-detail-title'));
    page.goTo(3);
    root.querySelector('.study-exit').click();
    assert.equal(exits.length, 1);
});

test('C6 an unknown study shows "not found" with a way back', async () => {
    const { page, root, exits } = setup();
    page.showNotFound();
    assert.ok(root.textContent.includes('Study not found.'));
    root.querySelector('.study-back').click();
    assert.equal(exits.length, 1);
});

test('a study with no cards shows not found instead of an empty reader', async () => {
    const { page, root } = setup({ loadStudy: async () => ({ cards: [] }) });
    await page.open(summary);
    assert.ok(root.textContent.includes('Study not found.'));
});

test('focus moves to the new page after paging so screen readers announce it', async () => {
    const { page, root } = setup();
    await page.open(summary);
    const doc = root.ownerDocument;
    page.next();
    assert.equal(doc.activeElement, root.querySelector('.study-page'));
    assert.equal(root.querySelector('.study-page').getAttribute('tabindex'), '-1');
});

test('close: a later open supersedes an earlier slow load', async () => {
    const resolvers = [];
    const { page, root } = setup({ loadStudy: () => new Promise((r) => resolvers.push(r)) });
    const first = page.open({ ...summary, id: 'old' });
    const second = page.open({ ...summary, id: 'new', title: 'New' });
    resolvers[1](study());
    await second;
    resolvers[0](study());
    await first;
    assert.equal(root.querySelector('.study-detail-title').textContent, 'New');
});

test('review: keys and swipes are ignored while loading, after an error, and after not-found (no stale pages)', async () => {
    let fail = false;
    const { page, root } = setup({ loadStudy: async () => { if (fail) throw new Error('offline'); return study(); } });
    await page.open(summary);
    fail = true;
    await page.open({ ...summary, id: 'other' });
    assert.ok(root.textContent.includes('Load error'));
    page.onKey('ArrowRight');
    page.onSwipe({ dx: -90, dy: 0 });
    assert.ok(root.textContent.includes('Load error'), 'the error message is not replaced by the previous study');
    page.showNotFound();
    page.onKey('ArrowRight');
    assert.ok(root.textContent.includes('Study not found.'));
});

test('review: completing keeps keyboard focus inside the reader (on the page) instead of dropping to <body>', async () => {
    const { page, root } = setup();
    await page.open(summary);
    page.goTo(3);
    root.querySelector('.study-complete').click();
    assert.equal(root.ownerDocument.activeElement, root.querySelector('.study-page'));
});

test('review: the segmented progress bar has an accessible name (the study title)', async () => {
    const { page, root } = setup();
    await page.open(summary);
    assert.equal(root.querySelector('.study-segments').getAttribute('aria-label'), 'Love');
});

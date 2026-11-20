'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'ui-pager-dots.js', 'discovery-cards.js', 'key-verse-card.js', 'encounter-reader-dom.js', 'encounter-reader-view.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createBuilder } = global.window.DomBuilder;

function setup() {
    const doc = new FakeDocument();
    const h = createBuilder(doc);
    const dom = global.window.EncounterReaderDom.createReaderDom({ h, t: (k) => k, imageUrlFor: () => 'img.webp' });
    const listView = doc.createElement('div');
    const detailView = doc.createElement('div');
    const calls = { entered: 0, exited: 0, retried: [], selected: [], completed: 0, prev: 0, next: 0 };
    const actions = {
        enter: () => { calls.entered += 1; },
        exit: () => { calls.exited += 1; },
        complete: () => { calls.completed += 1; },
        prev: () => { calls.prev += 1; },
        next: () => { calls.next += 1; },
        goTo: (i) => calls.selected.push(i),
        open: (summary) => calls.retried.push(summary.id),
    };
    const view = global.window.EncounterReaderView.createReaderView({ dom, h, root: detailView, listView, detailView, actions });
    return { view, doc, listView, detailView, calls };
}

const pages = [
    { kind: 'keyVerse', keyVerse: { reference: 'Mark 10:46', text: 'And they came' } },
    { kind: 'card', card: { type: 'cinematic_scene', title: 'Side', image_url: '' }, sectionIndex: 0, isLast: false },
    { kind: 'card', card: { type: 'completion', completion_verse: { reference: 'Mark 10:52', text: 'Go thy way' } }, sectionIndex: 1, isLast: true },
];
const base = { summary: { id: 'b1', title: 'Bartimaeus' }, phase: 'reader', index: 0, pages, footer: { isCompleted: false, copyright: 'cr' }, notFound: false, error: false, intro: null };

test('showing the reader hides the list and shows the detail; showing the list does the reverse', () => {
    const { view, listView, detailView } = setup();
    view.showReader();
    assert.equal(listView.hidden, true);
    assert.equal(detailView.hidden, false);
    view.showList();
    assert.equal(listView.hidden, false);
    assert.equal(detailView.hidden, true);
});

test('intro phase renders the intro with an enter button that calls enter', () => {
    const { view, detailView, calls } = setup();
    view.render({ ...base, phase: 'intro', intro: { id: 'b1', title: 'Bartimaeus', minutes: 7, testament: 'new', emoji: '📖', introImage: '', accent: null } });
    assert.ok(detailView.querySelector('.encounter-intro'));
    assert.equal(detailView.querySelector('.encounter-pages'), null);
    detailView.querySelector('.encounter-intro-enter').dispatch('click');
    assert.equal(calls.entered, 1);
});

test('reader phase renders progress, the current page and the nav, and the footer only on the last page', () => {
    const { view, detailView } = setup();
    view.render({ ...base, index: 0 });
    assert.ok(detailView.querySelector('.pager-dots'));
    assert.ok(detailView.querySelector('.encounter-page'));
    assert.ok(detailView.querySelector('.reader-nav'));
    assert.equal(detailView.querySelector('.encounter-footer'), null);
    view.render({ ...base, index: 2 });
    assert.ok(detailView.querySelector('.encounter-footer'));
});

test('re-rendering replaces the previous content instead of appending to it', () => {
    const { view, detailView } = setup();
    view.render({ ...base, index: 0 });
    view.render({ ...base, index: 1 });
    assert.equal(detailView.querySelectorAll('.reader-nav').length, 1);
    assert.equal(detailView.querySelectorAll('.pager-dots').length, 1);
});

test('not found shows the alert with a way back to the list', () => {
    const { view, detailView, calls } = setup();
    view.render({ ...base, notFound: true, pages: [] });
    assert.equal(detailView.querySelector('[role="alert"]').getAttribute('role'), 'alert');
    detailView.querySelector('.encounter-back').dispatch('click');
    assert.equal(calls.exited, 1);
});

test('error shows the alert and retry reopens the same encounter', () => {
    const { view, detailView, calls } = setup();
    view.render({ ...base, error: true, pages: [] });
    detailView.querySelector('.encounter-retry').dispatch('click');
    assert.deepEqual(calls.retried, ['b1']);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'discovery-cards.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const { sortCards, buildPages, parseEmphasis } = global.window.DiscoveryCards;

const card = (order, type = 'x') => ({ order, type, title: `c${order}` });

test('sortCards: orders by numeric or numeric-string `order`; 0 is a real position', () => {
    assert.deepEqual(sortCards([card('3'), card(1), card(0), card('2')]).map((c) => c.title), ['c0', 'c1', 'c2', 'c3']);
});

test('sortCards: missing or junk `order` falls back to array position; input is not mutated', () => {
    const input = [{ title: 'a' }, { title: 'b', order: 'x' }, { title: 'c', order: null }];
    assert.deepEqual(sortCards(input).map((c) => c.title), ['a', 'b', 'c']);
    assert.deepEqual(input.map((c) => c.title), ['a', 'b', 'c']);
});

test('sortCards: tolerates non-arrays and non-object entries', () => {
    assert.deepEqual(sortCards(undefined), []);
    assert.deepEqual(sortCards('x'), []);
    assert.deepEqual(sortCards([null, card(1), 7]).map((c) => c.title), ['c1']);
});

test('buildPages: the key verse is page 0 when there is one and cards exist (like the app)', () => {
    const pages = buildPages({ key_verse: { reference: 'J 1:1', text: 't' }, cards: [card(1), card(2)] });
    assert.deepEqual(pages.map((p) => p.kind), ['keyVerse', 'card', 'card']);
    assert.equal(pages[0].keyVerse.reference, 'J 1:1');
    assert.equal(pages[2].card.title, 'c2');
});

test('buildPages: no key verse page when the study has none, or no cards', () => {
    assert.deepEqual(buildPages({ cards: [card(1)] }).map((p) => p.kind), ['card']);
    assert.deepEqual(buildPages({ key_verse: { reference: 'r', text: 't' }, cards: [] }), []);
});

test('buildPages: card pages carry their section index (0-based, key verse excluded) and isLast', () => {
    const pages = buildPages({ key_verse: { reference: 'r', text: 't' }, cards: [card(1), card(2)] });
    assert.deepEqual(pages.map((p) => [p.kind, p.sectionIndex, p.isLast]), [['keyVerse', null, false], ['card', 0, false], ['card', 1, true]]);
});

test('buildPages: invalid studies yield no pages instead of throwing', () => {
    for (const bad of [null, undefined, 'x', {}, { cards: 'no' }]) assert.deepEqual(buildPages(bad), []);
});

test('parseEmphasis: bold, italic and plain segments (port of the app\'s buildEmphasisMarkdownText)', () => {
    assert.deepEqual(parseEmphasis('a **b** c *d* e'), [
        { text: 'a ' }, { text: 'b', bold: true }, { text: ' c ' }, { text: 'd', italic: true }, { text: ' e' },
    ]);
});

test('parseEmphasis: bold is matched before italic and unmatched markers stay literal', () => {
    assert.deepEqual(parseEmphasis('**x**'), [{ text: 'x', bold: true }]);
    assert.deepEqual(parseEmphasis('2 * 3 = 6'), [{ text: '2 * 3 = 6' }]);
    assert.deepEqual(parseEmphasis('**open'), [{ text: '**open' }]);
});

test('parseEmphasis: empty, non-string and markup-looking input are plain text', () => {
    assert.deepEqual(parseEmphasis(''), []);
    assert.deepEqual(parseEmphasis(null), []);
    assert.deepEqual(parseEmphasis('<b>x</b>'), [{ text: '<b>x</b>' }]);
});

// ---- shared section progress (studies and Encounters) ----
const pagesOf = (n, withKeyVerse = true) => [
    ...(withKeyVerse ? [{ kind: 'keyVerse', sectionIndex: null }] : []),
    ...Array.from({ length: n }, (_, i) => ({ kind: 'card', sectionIndex: i, isLast: i === n - 1 })),
];

test('countSections: counts card pages only, never the key-verse page', () => {
    assert.equal(global.window.DiscoveryCards.countSections(pagesOf(3)), 3);
    assert.equal(global.window.DiscoveryCards.countSections(pagesOf(3, false)), 3);
    assert.equal(global.window.DiscoveryCards.countSections([]), 0);
});

test('firstUnreadIndex: the first card page not yet read; page 0 when nothing is read or everything is read', () => {
    const pages = pagesOf(3); // key verse, card 0, card 1, card 2 -> indexes 0..3
    assert.equal(global.window.DiscoveryCards.firstUnreadIndex(pages, []), 0);
    assert.equal(global.window.DiscoveryCards.firstUnreadIndex(pages, [0]), 2);
    assert.equal(global.window.DiscoveryCards.firstUnreadIndex(pages, [0, 1]), 3);
    assert.equal(global.window.DiscoveryCards.firstUnreadIndex(pages, [0, 1, 2]), 0);
});

test('firstUnreadIndex: ignores read sections that do not exist and an empty page list', () => {
    assert.equal(global.window.DiscoveryCards.firstUnreadIndex(pagesOf(2), [9]), 1);
    assert.equal(global.window.DiscoveryCards.firstUnreadIndex([], [0]), 0);
});

test('progressFraction: completed is 1; sections over total, capped at 1; no total means no bar', () => {
    assert.equal(global.window.DiscoveryCards.progressFraction({ isCompleted: true, sections: 0, total: null }), 1);
    assert.equal(global.window.DiscoveryCards.progressFraction({ isCompleted: false, sections: 1, total: 4 }), 0.25);
    assert.equal(global.window.DiscoveryCards.progressFraction({ isCompleted: false, sections: 9, total: 4 }), 1);
    assert.equal(global.window.DiscoveryCards.progressFraction({ isCompleted: false, sections: 1, total: null }), null);
    assert.equal(global.window.DiscoveryCards.progressFraction({ isCompleted: false, sections: 1, total: 0 }), null);
});

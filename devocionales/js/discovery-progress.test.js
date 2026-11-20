'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'discovery-progress.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const { countSections, firstUnreadIndex, isFullyRead, progressFraction, toPercent, heroProps } = global.window.DiscoveryProgress;

const keyVerse = { sectionIndex: null };
const card = (i) => ({ sectionIndex: i });
const pages = [keyVerse, card(0), card(1), card(2)];

test('countSections: counts card pages only; bad input is 0', () => {
    assert.equal(countSections(pages), 3);
    assert.equal(countSections([]), 0);
    assert.equal(countSections(null), 0);
    assert.equal(countSections([null, keyVerse]), 0);
});

test('firstUnreadIndex: first unread card page; page 0 when nothing or everything is read', () => {
    assert.equal(firstUnreadIndex(pages, [0]), 2);
    assert.equal(firstUnreadIndex(pages, []), 0);
    assert.equal(firstUnreadIndex(pages, undefined), 0);
    assert.equal(firstUnreadIndex(pages, [0, 1, 2]), 0);
    assert.equal(firstUnreadIndex([], [0]), 0);
    assert.equal(firstUnreadIndex(null, [0]), 0);
});

test('isFullyRead: by section index, not by count', () => {
    assert.equal(isFullyRead(pages, [0, 1, 2]), true);
    assert.equal(isFullyRead(pages, [0, 1]), false);
    assert.equal(isFullyRead(pages, [1, 2, 3, 4, 5, 6]), false, 'six records, but card 0 is unread');
    assert.equal(isFullyRead(pages, [0, 1, 2, 9]), true, 'extra indexes from another version do not matter');
    assert.equal(isFullyRead([keyVerse], [0]), false, 'no sections to read is never "fully read"');
    assert.equal(isFullyRead(null, [0]), false);
});

test('progressFraction: completed is full; no total is null; the fraction is capped at 1', () => {
    assert.equal(progressFraction({ isCompleted: true, sections: 0, total: null }), 1);
    assert.equal(progressFraction({ isCompleted: false, sections: 2, total: null }), null);
    assert.equal(progressFraction({ isCompleted: false, sections: 2, total: 0 }), null);
    assert.equal(progressFraction({ isCompleted: false, sections: 1, total: 4 }), 0.25);
    assert.equal(progressFraction({ isCompleted: false, sections: 9, total: 4 }), 1);
});

test('toPercent: rounds a fraction to a whole percent; null and undefined stay null; 0 stays 0', () => {
    assert.equal(toPercent(0.333), 33);
    assert.equal(toPercent(1), 100);
    assert.equal(toPercent(0), 0);
    assert.equal(toPercent(null), null);
    assert.equal(toPercent(undefined), null);
});

test('heroProps: continue carries the percent and the continue copy; start has no percent', () => {
    const labels = { startHere: 'S', read: 'R', continueWhereLeft: 'CW', continueBtn: 'CB' };
    const c = { id: 'a', percent: 0.5 };
    assert.deepEqual(heroProps({ kind: 'continue', card: c }, labels), { label: 'CW', buttonLabel: 'CB', card: c, percent: 50 });
    assert.deepEqual(heroProps({ kind: 'start', card: c }, labels), { label: 'S', buttonLabel: 'R', card: c, percent: null });
    assert.equal(heroProps({ kind: 'continue', card: { id: 'a', percent: null } }, labels).percent, null);
});

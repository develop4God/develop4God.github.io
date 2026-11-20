'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'discovery-hero-dom.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const dom = global.window.DiscoveryHeroDom.createHeroDom({ h: global.window.DomBuilder.createBuilder(new FakeDocument()) });
const CARD = { id: 'a', emoji: '📖', title: 'Title', subtitle: 'Sub' };

test('progressBar: an ARIA progressbar with the width of the percent', () => {
    const bar = dom.progressBar(40, 'x');
    assert.equal(bar.getAttribute('role'), 'progressbar');
    assert.equal(bar.getAttribute('aria-valuenow'), '40');
    assert.match(bar.querySelector('.study-progress-fill').getAttribute('style'), /width:40%/);
});

test('buildHero: shows the label, title and button; the bar and percent only with a percent', () => {
    const plain = dom.buildHero({ label: 'Start', buttonLabel: 'Read', card: CARD }, { onOpen() {} });
    assert.equal(plain.querySelector('.study-hero-label').textContent, 'Start');
    assert.equal(plain.querySelector('.study-hero-button').textContent, 'Read');
    assert.equal(plain.querySelector('.study-hero-progress'), null);
    const part = dom.buildHero({ label: 'Go on', buttonLabel: 'Continue', card: CARD, percent: 0 }, { onOpen() {} });
    assert.equal(part.querySelector('.study-hero-percent').textContent, '0%', '0% is a real value, not "no bar"');
});

test('buildHero: the button reports the card id; a card without a subtitle draws none', () => {
    const opened = [];
    const hero = dom.buildHero({ label: 'l', buttonLabel: 'b', card: { ...CARD, subtitle: '' } }, { onOpen: (id) => opened.push(id) });
    hero.querySelector('.study-hero-button').click();
    assert.deepEqual(opened, ['a']);
    assert.equal(hero.querySelector('.study-card-subtitle'), null);
});

test('buildFilterChips: one chip per item with its count; only the active one is pressed; a click reports the filter', () => {
    const picked = [];
    const chips = dom.buildFilterChips([{ filter: 'all', label: 'All', count: 3 }, { filter: 'done', label: 'Done', count: 0 }], 'done', (f) => picked.push(f), 'Group');
    assert.equal(chips.getAttribute('aria-label'), 'Group');
    const buttons = chips.querySelectorAll('.study-chip');
    assert.deepEqual(buttons.map((b) => b.getAttribute('aria-pressed')), ['false', 'true']);
    assert.deepEqual(buttons.map((b) => b.querySelector('.study-chip-count').textContent), ['3', '0']);
    buttons[0].click();
    assert.deepEqual(picked, ['all']);
});

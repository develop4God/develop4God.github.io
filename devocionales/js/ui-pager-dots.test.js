'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const file of ['dom-builder.js', 'ui-pager-dots.js']) {
    const filename = path.join(__dirname, file);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const h = global.window.DomBuilder.createBuilder(new FakeDocument());
const dots = global.window.UiPagerDots.createPagerDots({ h });
const pageLabel = (n, total) => `${n}/${total}`;

test('one button per page; earlier ones filled, the current one marked', () => {
    const el = dots.build({ total: 4, index: 1, label: 'Story', pageLabel });
    const items = el.querySelectorAll('.pager-dot');
    assert.equal(el.getAttribute('role'), 'group');
    assert.equal(el.getAttribute('aria-label'), 'Story');
    assert.deepEqual(items.map((d) => d.tagName), Array(4).fill('BUTTON'));
    assert.deepEqual(items.map((d) => d.classList.contains('is-done')), [true, true, false, false]);
    assert.deepEqual(items.map((d) => d.getAttribute('aria-current')), [null, 'step', null, null]);
    assert.equal(items[2].getAttribute('aria-label'), '3/4');
});

test('tapping a dot reports its index; with no handler it is inert', () => {
    const picked = [];
    const el = dots.build({ total: 3, index: 0, label: 'x', pageLabel, onSelect: (i) => picked.push(i) });
    el.querySelectorAll('.pager-dot')[2].click();
    assert.deepEqual(picked, [2]);
    const inert = dots.build({ total: 3, index: 0, label: 'x', pageLabel });
    assert.doesNotThrow(() => inert.querySelectorAll('.pager-dot')[1].click());
});

test('zero pages renders an empty group, not an error', () => {
    assert.equal(dots.build({ total: 0, index: 0, label: 'x', pageLabel }).querySelectorAll('.pager-dot').length, 0);
});

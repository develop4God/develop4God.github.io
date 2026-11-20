'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'ui-pager-dots.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const W = global.window;
const doc = new FakeDocument();
const labels = { previous: 'Previous', next: 'Next', exit: 'Exit' };
const paging = W.ReaderPagingDom.createPagingDom({ h: W.DomBuilder.createBuilder(doc), labels });
const noop = () => {};

test('nav shows the labelled previous and next buttons', () => {
    const el = paging.buildNav({ index: 1, total: 3, onPrev: noop, onNext: noop, onExit: noop });
    assert.equal(el.querySelector('.reader-prev').textContent, 'Previous');
    assert.equal(el.querySelector('.reader-next').textContent, 'Next');
    assert.equal(el.querySelector('.reader-prev').getAttribute('disabled'), null);
});

test('previous is disabled on the first page', () => {
    const el = paging.buildNav({ index: 0, total: 3, onPrev: noop, onNext: noop, onExit: noop });
    assert.equal(el.querySelector('.reader-prev').getAttribute('disabled'), '');
});

test('on the last page next becomes exit, and exit calls the host', () => {
    let exited = false;
    const el = paging.buildNav({ index: 2, total: 3, onPrev: noop, onNext: noop, onExit: () => { exited = true; } });
    assert.equal(el.querySelector('.reader-next'), null);
    const exit = el.querySelector('.reader-exit');
    assert.equal(exit.textContent, 'Exit');
    exit.listeners.click.forEach((fn) => fn());
    assert.equal(exited, true);
});

test('a single-page reader has a disabled previous and an exit button', () => {
    const el = paging.buildNav({ index: 0, total: 1, onPrev: noop, onNext: noop, onExit: noop });
    assert.equal(el.querySelector('.reader-prev').getAttribute('disabled'), '');
    assert.ok(el.querySelector('.reader-exit'));
});

test('progress is the shared pager dots with the page count label', () => {
    const calls = [];
    const fakePager = { build: (args) => { calls.push(args); return { pager: true }; } };
    const withPager = W.ReaderPagingDom.createPagingDom({ h: W.DomBuilder.createBuilder(doc), labels, pagerDots: fakePager });
    const picked = [];
    const el = withPager.buildProgress(4, 1, 'Study', { onSelect: (i) => picked.push(i) });
    assert.deepEqual(el, { pager: true });
    assert.equal(calls[0].total, 4);
    assert.equal(calls[0].index, 1);
    assert.equal(calls[0].label, 'Study');
    assert.equal(calls[0].pageLabel(2, 4), '2 / 4');
    calls[0].onSelect(3);
    assert.deepEqual(picked, [3]);
});

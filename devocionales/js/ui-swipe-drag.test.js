'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const file of ['discovery-nav.js', 'ui-swipe-drag.js']) {
    const filename = path.join(__dirname, file);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createSwipeDrag } = global.window.UiSwipeDrag;

function setup({ rtl = false, canGo = () => true } = {}) {
    const page = { style: {} };
    const commits = [];
    const drag = createSwipeDrag({ classify: (d) => global.window.DiscoveryNav.classifySwipe(d, { rtl }), getTarget: () => page, rtl: () => rtl, canGo, onCommit: (dir) => commits.push(dir) });
    return { page, commits, drag };
}

test('a clear leftward drag commits "next" and hands the page back (LTR)', () => {
    const { page, commits, drag } = setup();
    drag.start(300, 400);
    drag.move(240, 404);
    assert.match(page.style.transform, /translateX\(-?\d/);
    drag.end(120, 410);
    assert.deepEqual(commits, ['next']);
    assert.equal(page.style.transform, '', 'the page is released before the new one slides in');
});

test('a rightward drag commits "prev"; RTL flips both directions', () => {
    const ltr = setup();
    ltr.drag.start(100, 0); ltr.drag.end(260, 0);
    assert.deepEqual(ltr.commits, ['prev']);
    const rtl = setup({ rtl: true });
    rtl.drag.start(300, 0); rtl.drag.end(120, 0);
    assert.deepEqual(rtl.commits, ['prev']);
});

test('a short or mostly vertical drag springs back without committing', () => {
    const { page, commits, drag } = setup();
    drag.start(200, 200); drag.move(180, 205); drag.end(180, 205);
    drag.start(200, 100); drag.move(160, 400); drag.end(150, 420);
    assert.deepEqual(commits, []);
    assert.equal(page.style.transform, '');
});

test('a vertical drag never moves the page (scrolling stays free)', () => {
    const { page, drag } = setup();
    drag.start(200, 100);
    drag.move(195, 260);
    assert.equal(page.style.transform || '', '');
});

test('end without any move still classifies the swipe (touchstart + touchend only)', () => {
    const { commits, drag } = setup();
    drag.start(300, 0); drag.end(120, 0);
    assert.deepEqual(commits, ['next']);
});

test('where there is no page to go to, the drag is resisted and nothing commits', () => {
    const { page, commits, drag } = setup({ canGo: () => false });
    drag.start(300, 0);
    drag.move(100, 0);
    const pulled = Math.abs(parseFloat(page.style.transform.replace(/[^\d.-]/g, '')));
    assert.ok(pulled > 0 && pulled < 40, `rubber-band, got ${pulled}`);
    drag.end(100, 0);
    assert.deepEqual(commits, []);
});

test('cancel and an end without a start are no-ops', () => {
    const { page, commits, drag } = setup();
    drag.end(10, 10);
    drag.start(300, 0); drag.move(200, 0); drag.cancel();
    assert.deepEqual(commits, []);
    assert.equal(page.style.transform, '');
});

test('a missing page element is tolerated', () => {
    const commits = [];
    const drag = createSwipeDrag({ classify: (d) => global.window.DiscoveryNav.classifySwipe(d), getTarget: () => null, rtl: () => false, canGo: () => true, onCommit: (d) => commits.push(d) });
    drag.start(300, 0); drag.move(250, 0); drag.end(100, 0);
    assert.deepEqual(commits, ['next']);
});

test('content-agnostic: any classifier drives it (no dependency on the study nav module)', () => {
    const commits = [];
    const drag = createSwipeDrag({ classify: ({ dx }) => (dx > 0 ? 'prev' : 'next'), getTarget: () => ({ style: {} }), rtl: () => false, canGo: () => true, onCommit: (d) => commits.push(d) });
    drag.start(0, 0); drag.end(5, 0);
    drag.start(0, 0); drag.end(-5, 0);
    assert.deepEqual(commits, ['prev', 'next']);
});

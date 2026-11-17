'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const file of ['dom-builder.js', 'ui-celebration.js']) {
    const filename = path.join(__dirname, file);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createCelebration } = global.window.UiCelebration;

function setup({ reducedMotion = false, pieces } = {}) {
    const doc = new FakeDocument();
    const timers = [];
    const setTimer = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    const clearTimer = (id) => { timers[id - 1] = null; };
    const h = global.window.DomBuilder.createBuilder(doc);
    const celebration = createCelebration({
        h, container: doc.body, reducedMotion: () => reducedMotion, setTimer, clearTimer, durationMs: 1800, pieces,
    });
    return { doc, timers, celebration };
}

const layers = (doc) => doc.body.querySelectorAll('.celebration');

test('burst: adds a decorative, non-interactive layer of confetti pieces', () => {
    const { doc, celebration } = setup({ pieces: 12 });
    assert.equal(celebration.burst(), true);
    const layer = doc.body.querySelector('.celebration');
    assert.ok(layer);
    assert.equal(layer.getAttribute('aria-hidden'), 'true');
    assert.equal(layer.querySelectorAll('.confetti-piece').length, 12);
});

test('burst: the layer removes itself when the animation is over', () => {
    const { doc, timers, celebration } = setup();
    celebration.burst();
    assert.equal(timers[0].ms, 1800);
    timers[0].fn();
    assert.equal(layers(doc).length, 0);
});

test('burst: respects reduced motion (nothing is added, returns false)', () => {
    const { doc, timers, celebration } = setup({ reducedMotion: true });
    assert.equal(celebration.burst(), false);
    assert.equal(layers(doc).length, 0);
    assert.equal(timers.length, 0);
});

test('burst: repeated calls replace the running burst instead of stacking layers', () => {
    const { doc, timers, celebration } = setup();
    celebration.burst();
    celebration.burst();
    assert.equal(layers(doc).length, 1);
    assert.equal(timers[0], null, 'the first removal timer was cancelled');
});

test('burst: a stale timer from a replaced burst cannot remove the new one', () => {
    const { doc, timers, celebration } = setup();
    celebration.burst();
    const stale = timers[0].fn;
    celebration.burst();
    stale();
    assert.equal(layers(doc).length, 1);
});

test('burst: an invalid piece count falls back to the default', () => {
    const { doc, celebration } = setup({ pieces: 0 });
    celebration.burst();
    assert.ok(doc.body.querySelectorAll('.confetti-piece').length > 0);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
const filename = path.join(__dirname, 'ui-toast.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const { createToast } = global.window.UiToast;

function setup(durationMs = 3000) {
    const doc = new FakeDocument();
    const timers = [];
    const setTimer = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    const clearTimer = (id) => { timers[id - 1] = null; };
    const toast = createToast({ document: doc, container: doc.body, durationMs, setTimer, clearTimer });
    return { doc, timers, toast };
}

test('show: renders a polite live region with the message as text', () => {
    const { doc, toast } = setup();
    toast.show('Saved');
    const region = doc.body.querySelector('[role="status"]');
    assert.ok(region);
    assert.equal(region.getAttribute('aria-live'), 'polite');
    assert.equal(region.textContent, 'Saved');
});

test('show: a message is never parsed as HTML', () => {
    const { doc, toast } = setup();
    toast.show('<img src=x onerror=alert(1)>');
    const region = doc.body.querySelector('[role="status"]');
    assert.equal(region.children.length, 0);
});

test('show: the toast hides itself after the duration', () => {
    const { doc, timers, toast } = setup(2500);
    toast.show('Hi');
    assert.equal(timers[0].ms, 2500);
    timers[0].fn();
    assert.equal(doc.body.querySelector('[role="status"]').classList.contains('is-visible'), false);
});

test('show: a second message replaces the first and restarts the timer', () => {
    const { doc, timers, toast } = setup();
    toast.show('one');
    toast.show('two');
    assert.equal(doc.body.querySelectorAll('[role="status"]').length, 1);
    assert.equal(doc.body.querySelector('[role="status"]').textContent, 'two');
    assert.equal(timers[0], null, 'the first timer was cleared');
});

test('show: error kind is exposed as a class for styling', () => {
    const { doc, toast } = setup();
    toast.show('Boom', { kind: 'error' });
    assert.ok(doc.body.querySelector('[role="status"]').classList.contains('toast-error'));
    toast.show('Fine');
    assert.equal(doc.body.querySelector('[role="status"]').classList.contains('toast-error'), false);
});

test('show: empty or non-string messages are ignored', () => {
    const { doc, toast } = setup();
    toast.show('');
    toast.show(undefined);
    assert.equal(doc.body.querySelector('[role="status"]'), null);
});

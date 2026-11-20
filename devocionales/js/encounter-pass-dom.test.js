'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'encounter-pass-dom.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createBuilder } = global.window.DomBuilder;
const { createPassDom } = global.window.EncounterPassDom;

const TEXT = {
    'pass_kicker': 'Encounters Pass',
    'pass_title': 'Thank you for supporting our ministry',
    'pass_body': 'Every encounter is open on this device.',
    'pass_button': 'Start reading',
};

function make(over = {}) {
    const doc = new FakeDocument();
    const trigger = doc.createElement('button');
    doc.body.append(trigger);
    trigger.focus();
    const timers = { pending: [], cleared: [] };
    const state = { inert: [], focusFallback: 0 };
    const pass = createPassDom({
        h: createBuilder(doc),
        t: (k) => TEXT[k] || k,
        container: doc.body,
        setBackgroundInert: (on) => state.inert.push(on),
        focusFallback: () => { state.focusFallback += 1; },
        setTimer: (fn, ms) => { const id = { fn, ms }; timers.pending.push(id); return id; },
        clearTimer: (id) => { timers.cleared.push(id); },
        autoCloseMs: 6500,
        ...over,
    });
    return { doc, pass, timers, state };
}
const dialog = (doc) => doc.body.querySelector('.encounter-pass');

test('open shows a modal dialog with the kicker, title, body and the start button', () => {
    const { doc, pass } = make();
    pass.open();
    const d = dialog(doc);
    assert.ok(d, 'dialog is in the page');
    assert.equal(d.getAttribute('role'), 'dialog');
    assert.equal(d.getAttribute('aria-modal'), 'true');
    assert.match(d.textContent, /Encounters Pass/);
    assert.match(d.textContent, /Thank you for supporting our ministry/);
    assert.match(d.textContent, /Every encounter is open/);
    assert.equal(d.querySelector('.encounter-pass-button').textContent, 'Start reading');
    assert.equal(pass.isOpen(), true);
});

test('open makes the background inert; close restores it', () => {
    const { pass, state } = make();
    pass.open();
    pass.close();
    assert.deepEqual(state.inert, [true, false]);
});

test('the start button closes the pass and returns focus to the page title', () => {
    const { doc, pass, state } = make();
    pass.open();
    dialog(doc).querySelector('.encounter-pass-button').dispatch('click');
    assert.equal(dialog(doc), null);
    assert.equal(pass.isOpen(), false);
    assert.equal(state.focusFallback, 1);
});

test('Escape closes the pass; other keys do not', () => {
    const { doc, pass } = make();
    pass.open();
    dialog(doc).dispatch('keydown', { key: 'Enter' });
    assert.equal(pass.isOpen(), true, 'Enter does not close');
    dialog(doc).dispatch('keydown', { key: 'Escape' });
    assert.equal(pass.isOpen(), false);
});

test('a second open while open shows one dialog, and a second close does nothing', () => {
    const { doc, pass, state } = make();
    pass.open();
    pass.open();
    assert.equal(doc.body.querySelectorAll('.encounter-pass').length, 1);
    pass.close();
    pass.close();
    assert.equal(state.focusFallback, 1);
    assert.deepEqual(state.inert, [true, false], 'inert toggled once per open/close pair');
});

test('the pass auto-closes after autoCloseMs, and a manual close cancels that timer', () => {
    const { doc, pass, timers } = make();
    pass.open();
    assert.equal(timers.pending.length, 1);
    assert.equal(timers.pending[0].ms, 6500);
    dialog(doc).querySelector('.encounter-pass-button').dispatch('click');
    assert.deepEqual(timers.cleared, [timers.pending[0]]);
});

test('closing when nothing is open is a no-op and never throws', () => {
    const { pass, state } = make();
    assert.doesNotThrow(() => pass.close());
    assert.equal(state.focusFallback, 0);
});

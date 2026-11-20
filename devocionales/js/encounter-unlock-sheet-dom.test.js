'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'encounter-unlock-sheet-dom.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createBuilder } = global.window.DomBuilder;
const { createUnlockSheet } = global.window.EncounterUnlockSheetDom;

const TEXT = {
    unlock_offer_title: 'Read at your own pace', unlock_offer_body: 'Everything is free.\n\nSupport the ministry.',
    unlock_offer_keep_reading: 'Keep reading in order', unlock_offer_play: 'Get the app',
};
function make(over = {}) {
    const doc = new FakeDocument();
    const trigger = doc.createElement('button');
    doc.body.append(trigger);
    trigger.focus();
    const sheet = createUnlockSheet({ h: createBuilder(doc), t: (k) => TEXT[k] || k, container: doc.body, playStoreUrl: 'https://play.test/app', ...over });
    return { doc, sheet, trigger };
}
const dialog = (doc) => doc.body.querySelector('.encounter-sheet');

test('B5 opens a modal dialog with the title and the body split into paragraphs', () => {
    const { doc, sheet } = make();
    sheet.open();
    const d = dialog(doc);
    assert.equal(d.getAttribute('role'), 'dialog');
    assert.equal(d.getAttribute('aria-modal'), 'true');
    assert.equal(d.querySelector('.encounter-sheet-title').textContent, 'Read at your own pace');
    assert.deepEqual(d.querySelectorAll('.encounter-sheet-body').map((p) => p.textContent), ['Everything is free.', 'Support the ministry.']);
    assert.equal(d.getAttribute('aria-labelledby'), d.querySelector('.encounter-sheet-title').getAttribute('id'));
});

test('B5 offers Keep reading and a Play Store link', () => {
    const { doc, sheet } = make();
    sheet.open();
    assert.equal(dialog(doc).querySelector('.encounter-sheet-keep').textContent, 'Keep reading in order');
    const link = dialog(doc).querySelector('.encounter-sheet-play');
    assert.equal(link.getAttribute('href'), 'https://play.test/app');
    assert.equal(link.getAttribute('rel'), 'noopener');
});

test('H5 no Play link where there is no app to open (showPlayLink false, e.g. iOS)', () => {
    const { doc, sheet } = make({ showPlayLink: false });
    sheet.open();
    assert.equal(dialog(doc).querySelectorAll('.encounter-sheet-play').length, 0);
});

test('keep reading, Escape and the backdrop all close it and give focus back to the trigger', () => {
    for (const how of ['keep', 'escape', 'backdrop']) {
        const { doc, sheet, trigger } = make();
        sheet.open();
        assert.ok(dialog(doc), how);
        if (how === 'keep') dialog(doc).querySelector('.encounter-sheet-keep').click();
        if (how === 'escape') dialog(doc).dispatch('keydown', { key: 'Escape' });
        if (how === 'backdrop') doc.body.querySelector('.encounter-sheet-backdrop').click();
        assert.equal(dialog(doc), null, how);
        assert.equal(doc.activeElement, trigger, how);
    }
});

test('clicking inside the dialog does not close it', () => {
    const { doc, sheet } = make();
    sheet.open();
    dialog(doc).querySelector('.encounter-sheet-title').click();
    assert.ok(dialog(doc));
});

test('opens with focus on Keep reading (safe default) and never stacks two sheets', () => {
    const { doc, sheet } = make();
    sheet.open();
    sheet.open();
    assert.equal(doc.body.querySelectorAll('.encounter-sheet').length, 1);
    assert.equal(doc.activeElement.classList.contains('encounter-sheet-keep'), true);
});

test('close() with nothing open is a no-op', () => {
    const { sheet } = make();
    assert.doesNotThrow(() => sheet.close());
});

test('F-gate: an extra action (the PayPal button in PR 4) can be mounted into the sheet', () => {
    const { doc, sheet } = make();
    let mounted = null;
    sheet.open({ mountActions: (el) => { mounted = el; } });
    assert.ok(mounted);
    assert.ok(dialog(doc).contains(mounted));
});

test('the page behind is made inert while the sheet is open and restored on close', () => {
    const calls = [];
    const { doc, sheet } = make({ setBackgroundInert: (on) => calls.push(on) });
    sheet.open();
    sheet.open(); // a second open is ignored, no extra call
    dialog(doc).querySelector('.encounter-sheet-keep').click();
    assert.deepEqual(calls, [true, false]);
});

test('review: if the card that opened the sheet was re-rendered away, focus goes to the fallback target', () => {
    let fell = 0;
    const { doc, sheet, trigger } = make({ focusFallback: () => { fell += 1; } });
    sheet.open();
    trigger.isConnected = false; // the list was re-rendered while the sheet was open
    dialog(doc).dispatch('keydown', { key: 'Escape' });
    assert.equal(fell, 1);
});

test('review: a connected trigger gets focus back and the fallback is not used', () => {
    let fell = 0;
    const { doc, sheet, trigger } = make({ focusFallback: () => { fell += 1; } });
    sheet.open();
    dialog(doc).dispatch('keydown', { key: 'Escape' });
    assert.equal(fell, 0);
    assert.equal(doc.activeElement, trigger);
});

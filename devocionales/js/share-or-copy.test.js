'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'share-or-copy.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const { shareOrCopy } = global.window.ShareOrCopy;

const payload = { title: 'T', text: 'body' };
const abort = () => Object.assign(new Error('cancelled'), { name: 'AbortError' });

test('uses the Web Share API when available', async () => {
    let received;
    const nav = { share: async (d) => { received = d; } };
    assert.equal(await shareOrCopy(nav, payload), 'shared');
    assert.deepEqual(received, payload);
});

test('a user-dismissed share sheet is "cancelled" and never falls back to the clipboard', async () => {
    let copied = false;
    const nav = { share: async () => { throw abort(); }, clipboard: { writeText: async () => { copied = true; } } };
    assert.equal(await shareOrCopy(nav, payload), 'cancelled');
    assert.equal(copied, false);
});

test('without Web Share the text is copied to the clipboard', async () => {
    let copied;
    const nav = { clipboard: { writeText: async (t) => { copied = t; } } };
    assert.equal(await shareOrCopy(nav, payload), 'copied');
    assert.equal(copied, 'body');
});

test('a share failure other than cancel falls back to copying', async () => {
    let copied;
    const nav = { share: async () => { throw new Error('NotAllowedError'); }, clipboard: { writeText: async (t) => { copied = t; } } };
    assert.equal(await shareOrCopy(nav, payload), 'copied');
    assert.equal(copied, 'body');
});

test('fails when neither sharing nor the clipboard is available', async () => {
    assert.equal(await shareOrCopy({}, payload), 'failed');
    assert.equal(await shareOrCopy(undefined, payload), 'failed');
});

test('fails when the clipboard write is rejected', async () => {
    const nav = { clipboard: { writeText: async () => { throw new Error('denied'); } } };
    assert.equal(await shareOrCopy(nav, payload), 'failed');
});

test('empty text is a failure and nothing is shared or copied', async () => {
    let called = false;
    const nav = { share: async () => { called = true; }, clipboard: { writeText: async () => { called = true; } } };
    assert.equal(await shareOrCopy(nav, { title: 'T', text: '' }), 'failed');
    assert.equal(await shareOrCopy(nav, null), 'failed');
    assert.equal(called, false);
});

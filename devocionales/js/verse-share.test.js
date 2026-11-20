'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const name of ['verse-share.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const W = global.window;

const verse = { reference: 'Mark 10:46', text: 'And they came to Jericho' };

test('share text has the reference, the verse in quotes and the store link', () => {
    const text = W.VerseShare.buildVerseShareText(verse, { playStoreUrl: 'https://store.example/app' });
    assert.equal(text, '📖 *Mark 10:46*\n"And they came to Jericho"\n\nhttps://store.example/app');
});

test('share text without a reference or text is empty, never "undefined"', () => {
    assert.equal(W.VerseShare.buildVerseShareText({ reference: '', text: '' }, { playStoreUrl: 'x' }), '');
    assert.equal(W.VerseShare.buildVerseShareText({ reference: undefined, text: null }, { playStoreUrl: 'x' }), '');
});

const messages = { copied: 'Copied', shareError: 'Could not share' };

function fakeToast() {
    const shown = [];
    return { shown, show: (text, options) => shown.push({ text, options }) };
}

test('share hands the text to shareOrCopy with the navigator and the verse reference as title', async () => {
    const calls = [];
    const share = W.VerseShare.createVerseShare({
        shareOrCopy: async (nav, payload) => { calls.push({ nav, payload }); return 'shared'; },
        navigator: { id: 'nav' },
        playStoreUrl: 'https://store.example/app',
        toast: fakeToast(),
        messages,
    });
    await share(verse);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].nav.id, 'nav');
    assert.equal(calls[0].payload.title, 'Mark 10:46');
    assert.match(calls[0].payload.text, /And they came to Jericho/);
});

test('a copied verse shows the copied message; a shared or cancelled one shows nothing', async () => {
    const toast = fakeToast();
    const copied = W.VerseShare.createVerseShare({
        shareOrCopy: async () => 'copied', navigator: {}, playStoreUrl: 'x', toast, messages,
    });
    await copied(verse);
    assert.deepEqual(toast.shown, [{ text: 'Copied', options: undefined }]);

    const quiet = fakeToast();
    for (const outcome of ['shared', 'cancelled']) {
        const share = W.VerseShare.createVerseShare({
            shareOrCopy: async () => outcome, navigator: {}, playStoreUrl: 'x', toast: quiet, messages,
        });
        await share(verse);
    }
    assert.deepEqual(quiet.shown, []);
});

test('a failed share shows the error message as an error toast', async () => {
    const toast = fakeToast();
    const share = W.VerseShare.createVerseShare({
        shareOrCopy: async () => 'failed', navigator: {}, playStoreUrl: 'x', toast, messages,
    });
    await share(verse);
    assert.deepEqual(toast.shown, [{ text: 'Could not share', options: { kind: 'error' } }]);
});

test('an empty verse is not shared', async () => {
    let called = false;
    const share = W.VerseShare.createVerseShare({
        shareOrCopy: async () => { called = true; return 'shared'; },
        navigator: {},
        playStoreUrl: 'x',
        toast: fakeToast(),
        messages,
    });
    await share({ reference: '', text: '' });
    assert.equal(called, false);
});

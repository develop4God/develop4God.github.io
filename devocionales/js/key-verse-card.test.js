'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'key-verse-card.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const W = global.window;
const doc = new FakeDocument();
const card = W.KeyVerseCard.createKeyVerseCard({ h: W.DomBuilder.createBuilder(doc) });

test('renders the label, verse text and reference inside one styled card', () => {
    const el = card.build({ label: 'KEY VERSE', reference: 'Mark 10:46', text: 'And they came to Jericho' });
    assert.equal(el.className, 'key-verse-card');
    assert.equal(el.querySelector('.key-verse-card-label').textContent, 'KEY VERSE');
    assert.equal(el.querySelector('.key-verse-card-text').textContent, 'And they came to Jericho');
    assert.equal(el.querySelector('.key-verse-card-ref').textContent, 'Mark 10:46');
});

test('keeps markup in the verse text as plain text (no HTML from content)', () => {
    const el = card.build({ label: 'KEY VERSE', reference: 'Mark 10:46', text: 'Hi <b>there</b>' });
    assert.equal(el.querySelector('.key-verse-card-text').textContent, 'Hi <b>there</b>');
    assert.equal(el.querySelector('b'), null);
});

test('missing text or reference renders an empty string, not "undefined"', () => {
    const el = card.build({ label: 'KEY VERSE', reference: undefined, text: null });
    assert.equal(el.querySelector('.key-verse-card-text').textContent, '');
    assert.equal(el.querySelector('.key-verse-card-ref').textContent, '');
});

test('a missing label is omitted rather than rendered blank', () => {
    const el = card.build({ label: '', reference: 'John 3:16', text: 'For God so loved' });
    assert.equal(el.querySelector('.key-verse-card-label'), null);
});

test('shows a share button only when a share handler is injected', () => {
    const plain = card.build({ label: 'KEY VERSE', reference: 'John 3:16', text: 'For God so loved' });
    assert.equal(plain.querySelector('.key-verse-card-share'), null);
});

test('share button calls the injected handler with the verse', () => {
    const calls = [];
    const shared = W.KeyVerseCard.createKeyVerseCard({
        h: W.DomBuilder.createBuilder(doc),
        shareVerse: (verse) => calls.push(verse),
        shareLabel: 'Share',
    });
    const el = shared.build({ label: 'KEY VERSE', reference: 'John 3:16', text: 'For God so loved' });
    const button = el.querySelector('.key-verse-card-share');
    assert.equal(button.getAttribute('aria-label'), 'Share');
    button.listeners.click.forEach((fn) => fn());
    assert.deepEqual(calls, [{ reference: 'John 3:16', text: 'For God so loved' }]);
});

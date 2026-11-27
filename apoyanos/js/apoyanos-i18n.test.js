'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// apoyanos-i18n.js is a browser IIFE that starts loading on its own; load it with a stub window whose fetch
// never resolves, then test its pure helpers.
const window = { fetch: () => new Promise(() => {}) };
const document = { readyState: 'complete', querySelectorAll: () => [], documentElement: {} };
const filename = path.join(__dirname, 'apoyanos-i18n.js');
const source = fs.readFileSync(filename, 'utf8');
vm.runInThisContext(`(function(window, document, navigator, localStorage){${source}\n})`, { filename })(
    window, document, { language: 'en-US' }, { getItem: () => null, setItem: () => {} });
const { pickLanguage, interpolate, lookup, splitSlots, SUPPORTED } = window.ApoyanosI18n;

const LANG_DIR = path.join(__dirname, '..', '..', 'lang', 'apoyanos');
const load = (lang) => JSON.parse(fs.readFileSync(path.join(LANG_DIR, `${lang}.json`), 'utf8'));

test('pickLanguage: a saved supported language wins over the browser language', () => {
    assert.equal(pickLanguage({ saved: 'es', browser: 'en-US' }), 'es');
});

test('pickLanguage: a saved language the page does not have yet falls through to the browser language', () => {
    assert.equal(pickLanguage({ saved: 'ru', browser: 'es-PA' }), 'es');
});

test('pickLanguage: unsupported saved and browser languages fall back to English', () => {
    assert.equal(pickLanguage({ saved: 'ru', browser: 'ko-KR' }), 'en');
});

test('pickLanguage: missing or empty inputs fall back to English instead of throwing', () => {
    assert.equal(pickLanguage({ saved: null, browser: undefined }), 'en');
    assert.equal(pickLanguage({ saved: '', browser: '' }), 'en');
});

test('pickLanguage: the browser tag is case-insensitive', () => {
    assert.equal(pickLanguage({ saved: null, browser: 'ES-pa' }), 'es');
});

test('interpolate: replaces every placeholder, including repeated ones', () => {
    assert.equal(interpolate('{a} and {a} and {b}', { a: 1, b: 'x' }), '1 and 1 and x');
});

test('interpolate: leaves an unknown placeholder visible and tolerates missing params', () => {
    assert.equal(interpolate('hi {name}', {}), 'hi {name}');
    assert.equal(interpolate('hi {name}'), 'hi {name}');
});

test('interpolate: does not treat the replacement text as a pattern (no "$&" expansion)', () => {
    assert.equal(interpolate('amount {n}', { n: '$&' }), 'amount $&');
});

test('lookup: resolves nested dotted keys and returns null for a missing path or a non-string', () => {
    const tree = { a: { b: 'x', c: { d: 'y' } } };
    assert.equal(lookup(tree, 'a.b'), 'x');
    assert.equal(lookup(tree, 'a.c.d'), 'y');
    assert.equal(lookup(tree, 'a.missing'), null);
    assert.equal(lookup(tree, 'a.c'), null);
    assert.equal(lookup(null, 'a'), null);
});

test('splitSlots: separates literal text from {slot} markers, keeping word order', () => {
    assert.deepEqual(splitSlots('{lead} body text. {link}'), [
        { slot: 'lead' }, { text: ' body text. ' }, { slot: 'link' },
    ]);
});

test('splitSlots: plain text is a single text part, an empty string has no parts', () => {
    assert.deepEqual(splitSlots('just text'), [{ text: 'just text' }]);
    assert.deepEqual(splitSlots(''), []);
});

test('SUPPORTED: lists exactly the languages that have a JSON file', () => {
    const files = fs.readdirSync(LANG_DIR).map((f) => f.replace('.json', '')).sort();
    assert.deepEqual([...SUPPORTED].sort(), files);
});

test('every data-i18n key used by the page exists in every language file', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-attr)?="([^"]+)"/g)].map((m) => m[1].split(':').pop());
    assert.ok(keys.length > 40, 'the page should be marked up');
    for (const lang of SUPPORTED) {
        const tree = load(lang);
        for (const key of keys) {
            assert.equal(typeof lookup(tree, key), 'string', `${lang}.json is missing ${key}`);
        }
    }
});

test('every t() key used by the page scripts exists in every language file', () => {
    const scripts = ['../donate.js', '../index.html'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
    const keys = [...scripts.matchAll(/\bt\('([a-zA-Z.]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('.'));
    assert.ok(keys.length > 10, 'the scripts should use t()');
    for (const lang of SUPPORTED) {
        const tree = load(lang);
        for (const key of keys) {
            assert.equal(typeof lookup(tree, key), 'string', `${lang}.json is missing ${key}`);
        }
    }
});

test('the translated sentences keep every {slot} marker their link or bold part needs', () => {
    const required = { 'give.transfer': ['link'], 'give.unlock': ['lead', 'link'] };
    for (const lang of SUPPORTED) {
        for (const [key, slots] of Object.entries(required)) {
            const found = splitSlots(lookup(load(lang), key)).filter((p) => p.slot).map((p) => p.slot).sort();
            assert.deepEqual(found, slots, `${lang}.json ${key}`);
        }
    }
});

test('each donation frequency has its own thank-you text', () => {
    for (const lang of SUPPORTED) {
        for (const frequency of ['once', 'monthly', 'yearly']) {
            assert.equal(typeof lookup(load(lang), `thanks.${frequency}`), 'string', `${lang}.json thanks.${frequency}`);
        }
    }
});

test('every placeholder in the Spanish copy is also in the English copy', () => {
    const flat = (tree, prefix = '') => Object.entries(tree).flatMap(([k, v]) =>
        typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]);
    const en = Object.fromEntries(flat(load('en')));
    for (const [key, text] of flat(load('es'))) {
        const marks = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
        assert.equal(marks(en[key]), marks(text), `placeholders differ in ${key}`);
    }
});

test('the numbers and the Apple/Mac prices are identical in both languages', () => {
    const numbers = (s) => (s.match(/\d+(?:[.,]\d+)*/g) || []).join('|');
    const flat = (tree, prefix = '') => Object.entries(tree).flatMap(([k, v]) =>
        typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]);
    const en = Object.fromEntries(flat(load('en')));
    for (const [key, text] of flat(load('es'))) {
        if (key.startsWith('thanks.verseRef') || key.startsWith('milestones.')) { continue; } // 2 Corintios 9:6 and month names are localized
        assert.equal(numbers(en[key]), numbers(text), `numbers differ in ${key}`);
    }
});

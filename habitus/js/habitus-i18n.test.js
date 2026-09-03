'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// habitus-i18n.js is a browser IIFE that, on load, checks
// document.readyState and calls init() (which touches localStorage,
// fetch, and window.RtlHelper). Stub out a minimal browser-like
// environment so the module loads without throwing, then test the one
// pure, exported helper: getNestedTranslation.
global.window = global.window || {};
Object.defineProperty(global, 'navigator', {
    value: { language: 'en-US' },
    configurable: true,
});
global.localStorage = {
    _store: {},
    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null;
    },
    setItem(key, value) {
        this._store[key] = value;
    },
};
global.window.RtlHelper = { applyDirection: () => {} };
global.document = {
    readyState: 'complete',
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    title: '',
};
// Reject immediately and synchronously so the module's own top-level init()
// (triggered at load time by readyState 'complete') settles before later
// tests reassign global.document, instead of leaving a dangling promise.
global.fetch = () => Promise.reject(new Error('no network in tests'));

const filename = path.join(__dirname, 'habitus-i18n.js');
const source = fs.readFileSync(filename, 'utf8');
// vm.runInThisContext (not new Function) so c8/V8 can attribute coverage
// back to this real filename instead of an anonymous eval.
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { getNestedTranslation, applyTranslationsForTest } = global.window.HabitusI18n;

test('getNestedTranslation: resolves a nested dotted key', () => {
    const translations = { header: { mainTitle: 'Hello' } };
    assert.equal(getNestedTranslation(translations, 'header.mainTitle'), 'Hello');
});

test('getNestedTranslation: resolves a deeply nested key', () => {
    const translations = { features: { ai: { title: 'AI Habits' } } };
    assert.equal(getNestedTranslation(translations, 'features.ai.title'), 'AI Habits');
});

test('getNestedTranslation: returns null for a missing top-level key', () => {
    const translations = { header: { mainTitle: 'Hello' } };
    assert.equal(getNestedTranslation(translations, 'missing.key'), null);
});

test('getNestedTranslation: returns null when a middle segment is missing', () => {
    const translations = { header: { mainTitle: 'Hello' } };
    assert.equal(getNestedTranslation(translations, 'header.contactCta.deep'), null);
});

test('getNestedTranslation: returns null against an empty translations object', () => {
    assert.equal(getNestedTranslation({}, 'header.mainTitle'), null);
});

test('applyTranslationsForTest: renders SiteFooter shared lines from translations.footer', () => {
    const renderCalls = [];
    global.window.SiteFooter = {
        renderSharedLines: (el, opts) => renderCalls.push({ el, opts }),
    };
    const footerEl = { id: 'page-footer' };
    global.document = {
        querySelectorAll: () => [],
        querySelector: () => null,
        getElementById: (id) => (id === 'page-footer' ? footerEl : null),
        title: '',
    };

    applyTranslationsForTest({
        footer: { copyright: '© Test', madeWith: 'Made with test' },
    });

    assert.equal(renderCalls.length, 1);
    assert.equal(renderCalls[0].el, footerEl);
    assert.deepEqual(renderCalls[0].opts, { copyright: '© Test', madeWith: 'Made with test' });

    delete global.window.SiteFooter;
});

test('applyTranslationsForTest: does not call SiteFooter when translations has no footer key', () => {
    const renderCalls = [];
    global.window.SiteFooter = {
        renderSharedLines: (el, opts) => renderCalls.push({ el, opts }),
    };
    global.document = {
        querySelectorAll: () => [],
        querySelector: () => null,
        getElementById: () => null,
        title: '',
    };

    applyTranslationsForTest({ header: { mainTitle: 'Hi' } });

    assert.equal(renderCalls.length, 0);

    delete global.window.SiteFooter;
});

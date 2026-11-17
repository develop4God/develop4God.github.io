'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'discovery-copyright.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const { createCopyright, DEFAULT_COPYRIGHT } = global.window.DiscoveryCopyright;

const info = { es: { RVR1960: { copyright: 'RVR text' } } };
const lookup = (lang, version) => (info[lang] && info[lang][version]) || null;
const { resolve } = createCopyright({ versionInfo: lookup });

test('uses the known version text for the STUDY\'s own version (not the reader selection)', () => {
    assert.equal(resolve('es', 'RVR1960'), 'RVR text');
});

test('an unknown version falls back to the language default, like the app', () => {
    assert.equal(resolve('en', 'KJ2000'), DEFAULT_COPYRIGHT.en);
    assert.equal(resolve('zh', 'CUV1919'), DEFAULT_COPYRIGHT.zh);
});

test('every supported language has a non-empty default', () => {
    for (const lang of ['es', 'en', 'pt', 'fr', 'ja', 'zh', 'hi', 'de', 'ar', 'fil']) {
        assert.ok(DEFAULT_COPYRIGHT[lang] && DEFAULT_COPYRIGHT[lang].length > 10, lang);
    }
});

test('unknown language or missing version still yields a text (English default), never throws', () => {
    assert.equal(resolve('xx', 'ABC'), DEFAULT_COPYRIGHT.en);
    assert.equal(resolve('en', undefined), DEFAULT_COPYRIGHT.en);
    assert.equal(resolve(undefined, undefined), DEFAULT_COPYRIGHT.en);
});

test('a version row without copyright text falls back to the default', () => {
    const r = createCopyright({ versionInfo: () => ({ name: 'x' }) }).resolve('en', 'X');
    assert.equal(r, DEFAULT_COPYRIGHT.en);
});

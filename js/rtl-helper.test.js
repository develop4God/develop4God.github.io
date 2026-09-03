'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};

const filename = path.join(__dirname, 'rtl-helper.js');
const source = fs.readFileSync(filename, 'utf8');
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { isRtl, applyDirection } = global.window.RtlHelper;

test('isRtl: true for arabic', () => {
    assert.equal(isRtl('ar'), true);
});

test('isRtl: false for every other supported language', () => {
    for (const lang of ['en', 'es', 'fr', 'pt', 'zh', 'ja', 'hi', 'de', 'fil']) {
        assert.equal(isRtl(lang), false, `expected ${lang} to be LTR`);
    }
});

test('applyDirection: sets dir="rtl" and lang for arabic', () => {
    global.document = { documentElement: {} };

    applyDirection('ar');

    assert.equal(global.document.documentElement.lang, 'ar');
    assert.equal(global.document.documentElement.dir, 'rtl');
});

test('applyDirection: sets dir="ltr" and lang for a non-RTL language', () => {
    global.document = { documentElement: {} };

    applyDirection('de');

    assert.equal(global.document.documentElement.lang, 'de');
    assert.equal(global.document.documentElement.dir, 'ltr');
});

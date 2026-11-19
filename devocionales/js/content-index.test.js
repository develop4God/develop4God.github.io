'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'content-index.js');
const source = fs.readFileSync(filename, 'utf8');
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { isObject, isNonEmptyString, readMinutes, pickLocalized, DEFAULT_MINUTES } = global.window.ContentIndex;

test('isObject: plain objects only', () => {
    assert.equal(isObject({}), true);
    for (const v of [null, undefined, [], 'x', 1, () => {}]) assert.equal(isObject(v), false);
});

test('isNonEmptyString: strings with content only', () => {
    assert.equal(isNonEmptyString('a'), true);
    for (const v of ['', null, undefined, 1, {}, []]) assert.equal(isNonEmptyString(v), false);
});

test('readMinutes: positive numbers (also numeric strings) win, everything else is the default', () => {
    assert.equal(readMinutes({ en: 7 }, 'en'), 7);
    assert.equal(readMinutes({ en: '8' }, 'en'), 8);
    for (const bad of [undefined, null, 'x', [], {}, { en: 0 }, { en: -1 }, { en: 'abc' }, { en: NaN }, { es: 4 }]) {
        assert.equal(readMinutes(bad, 'en'), DEFAULT_MINUTES);
    }
    assert.equal(DEFAULT_MINUTES, 5);
});

test('pickLocalized: exact language, then the given fallback language, then empty', () => {
    assert.equal(pickLocalized({ en: 'E', es: 'S' }, 'es', 'en'), 'S');
    assert.equal(pickLocalized({ en: 'E' }, 'es', 'en'), 'E');
    assert.equal(pickLocalized({ fr: 'F' }, 'es', 'en'), '');
    assert.equal(pickLocalized({ en: '' }, 'es', 'en'), '');
    assert.equal(pickLocalized({ en: 'E' }, 'es'), '');
});

test('pickLocalized: non-object maps give empty and never throw', () => {
    for (const bad of [null, undefined, 'x', [], 5]) assert.equal(pickLocalized(bad, 'en', 'es'), '');
});

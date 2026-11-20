'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'storage-json.js');
const source = fs.readFileSync(filename, 'utf8');
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { createJsonStorage } = global.window.StorageJson;

const memory = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
};
const blocked = () => ({
    getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); },
});

test('write/read round-trips JSON values', () => {
    const s = createJsonStorage(memory());
    assert.equal(s.write('k', { a: [1, 2] }), true);
    assert.deepEqual(s.read('k'), { a: [1, 2] });
});

test('read: missing, empty or corrupt values are null, never a throw', () => {
    const raw = memory();
    const s = createJsonStorage(raw);
    assert.equal(s.read('nope'), null);
    raw.setItem('empty', '');
    assert.equal(s.read('empty'), null);
    raw.setItem('bad', '{not json');
    assert.equal(s.read('bad'), null);
});

test('remove: deletes the key', () => {
    const s = createJsonStorage(memory());
    s.write('k', 1);
    s.remove('k');
    assert.equal(s.read('k'), null);
});

test('readSet: keeps only strings, ignores non-array values', () => {
    const s = createJsonStorage(memory());
    s.write('ids', ['a', 1, null, 'b', {}]);
    assert.deepEqual([...s.readSet('ids')], ['a', 'b']);
    s.write('obj', { a: 1 });
    assert.equal(s.readSet('obj').size, 0);
    assert.equal(s.readSet('missing').size, 0);
});

test('blocked or full storage: reads give null, writes report false, nothing throws', () => {
    const s = createJsonStorage(blocked());
    assert.equal(s.read('k'), null);
    assert.equal(s.write('k', 1), false);
    assert.doesNotThrow(() => s.remove('k'));
    assert.equal(s.readSet('k').size, 0);
});

test('a missing storage object (e.g. no localStorage) degrades the same way', () => {
    const s = createJsonStorage(undefined);
    assert.equal(s.read('k'), null);
    assert.equal(s.write('k', 1), false);
    assert.doesNotThrow(() => s.remove('k'));
});

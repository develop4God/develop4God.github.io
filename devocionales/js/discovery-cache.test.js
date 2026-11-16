'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'discovery-cache.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const { createCacheStore } = global.window.DiscoveryCache;

// A real Response-like object is enough: the module only uses `new Response(body)` and `.json()`.
global.Response = global.Response || class {};
function fakeCaches() {
    const stores = new Map();
    return {
        stores,
        open: async (name) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const m = stores.get(name);
            return {
                match: async (k) => (m.has(k) ? new Response(m.get(k)) : undefined),
                put: async (k, res) => { m.set(k, await res.text()); },
                delete: async (k) => m.delete(k),
            };
        },
    };
}

test('put then get round-trips JSON values', async () => {
    const store = createCacheStore(fakeCaches(), 'studies-v1');
    await store.put('study:en:a', { version: '1', data: { x: [1, 2] } });
    assert.deepEqual(await store.get('study:en:a'), { version: '1', data: { x: [1, 2] } });
});

test('get of a missing key is null', async () => {
    assert.equal(await createCacheStore(fakeCaches(), 'n').get('nope'), null);
});

test('remove deletes the entry', async () => {
    const store = createCacheStore(fakeCaches(), 'n');
    await store.put('k', { a: 1 });
    await store.remove('k');
    assert.equal(await store.get('k'), null);
});

test('put overwrites the previous value for the same key', async () => {
    const store = createCacheStore(fakeCaches(), 'n');
    await store.put('k', { v: 1 });
    await store.put('k', { v: 2 });
    assert.deepEqual(await store.get('k'), { v: 2 });
});

test('keys are namespaced under a fake origin so they never clash with real URLs', async () => {
    const caches = fakeCaches();
    await createCacheStore(caches, 'n').put('k', { a: 1 });
    assert.ok([...caches.stores.get('n').keys()][0].startsWith('/__discovery__/'));
});

test('without the Cache API (insecure context) the store is a harmless no-op', async () => {
    const store = createCacheStore(undefined, 'n');
    await store.put('k', { a: 1 });
    assert.equal(await store.get('k'), null);
    await store.remove('k');
});

test('a corrupt cached body reads as a miss instead of throwing', async () => {
    const caches = fakeCaches();
    const store = createCacheStore(caches, 'n');
    await store.put('k', { a: 1 });
    const m = caches.stores.get('n');
    m.set([...m.keys()][0], '{not json');
    assert.equal(await store.get('k'), null);
});

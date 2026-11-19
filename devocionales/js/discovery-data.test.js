'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'discovery-data.js');
const source = fs.readFileSync(filename, 'utf8');
// vm.runInThisContext (not new Function) so c8 attributes coverage to the real file.
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { parseIndex, createDiscoveryData, DEFAULT_MINUTES } = global.window.DiscoveryData;

const entry = (over = {}) => ({
    id: 'love_001',
    version: '1.2',
    emoji: '🧎',
    files: { es: 'love_es.json', en: 'love_en.json' },
    titles: { es: 'Amor', en: 'Love' },
    subtitles: { es: 'Sub es', en: 'Sub en' },
    estimated_reading_minutes: { es: 9, en: 7 },
    ...over,
});

// ---- parseIndex (A1-A3) ----

test('parseIndex: maps a valid entry for the current language', () => {
    const [s] = parseIndex({ studies: [entry()] }, 'en');
    assert.deepEqual(s, {
        id: 'love_001', version: '1.2', emoji: '🧎', title: 'Love',
        subtitle: 'Sub en', minutes: 7, file: 'love_en.json',
    });
});

test('parseIndex: A1 hides studies without a file for the language (no fallback language)', () => {
    const list = parseIndex({ studies: [entry({ files: { es: 'x.json' } })] }, 'en');
    assert.equal(list.length, 0);
});

test('parseIndex: A1 treats an empty or non-string file name as missing', () => {
    const list = parseIndex({ studies: [entry({ files: { en: '' } }), entry({ id: 'b', files: { en: 42 } })] }, 'en');
    assert.equal(list.length, 0);
});

test('parseIndex: A2 title falls back to es, then to the id', () => {
    const noEn = entry({ titles: { es: 'Solo es' } });
    assert.equal(parseIndex({ studies: [noEn] }, 'en')[0].title, 'Solo es');
    const noTitles = entry({ titles: {} });
    assert.equal(parseIndex({ studies: [noTitles] }, 'en')[0].title, 'love_001');
});

test('parseIndex: A2 subtitle defaults to empty string', () => {
    assert.equal(parseIndex({ studies: [entry({ subtitles: undefined })] }, 'en')[0].subtitle, '');
});

test('parseIndex: A2 emoji defaults to the book emoji', () => {
    assert.equal(parseIndex({ studies: [entry({ emoji: undefined })] }, 'en')[0].emoji, '📖');
    assert.equal(parseIndex({ studies: [entry({ emoji: '' })] }, 'en')[0].emoji, '📖');
});

test('parseIndex: A2 reading minutes default to 5 when missing, zero, negative, NaN or non-numeric', () => {
    assert.equal(DEFAULT_MINUTES, 5);
    for (const bad of [undefined, null, {}, { en: 0 }, { en: -3 }, { en: 'abc' }, { en: NaN }, 'x']) {
        const [s] = parseIndex({ studies: [entry({ estimated_reading_minutes: bad })] }, 'en');
        assert.equal(s.minutes, 5, `value ${JSON.stringify(bad)}`);
    }
});

test('parseIndex: A2 accepts numeric strings for minutes', () => {
    const [s] = parseIndex({ studies: [entry({ estimated_reading_minutes: { en: '12' } })] }, 'en');
    assert.equal(s.minutes, 12);
});

test('parseIndex: A3 skips malformed entries without breaking the list', () => {
    const good = entry({ id: 'good' });
    const list = parseIndex({ studies: [null, 'str', 7, [], {}, { id: '' }, { id: 5 }, good] }, 'en');
    assert.deepEqual(list.map((s) => s.id), ['good']);
});

test('parseIndex: A3 version defaults to "0" when missing so cache keys stay stable', () => {
    assert.equal(parseIndex({ studies: [entry({ version: undefined })] }, 'en')[0].version, '0');
});

test('parseIndex: keeps index order', () => {
    const list = parseIndex({ studies: [entry({ id: 'b' }), entry({ id: 'a' })] }, 'en');
    assert.deepEqual(list.map((s) => s.id), ['b', 'a']);
});

test('parseIndex: invalid roots return an empty list', () => {
    for (const bad of [null, undefined, 'x', 5, [], {}, { studies: 'no' }, { studies: null }]) {
        assert.deepEqual(parseIndex(bad, 'en'), [], JSON.stringify(bad));
    }
});

test('parseIndex: missing language returns an empty list rather than throwing', () => {
    assert.deepEqual(parseIndex({ studies: [entry()] }, undefined), []);
});

// ---- loader (A4, A5) ----

function memoryCache() {
    const map = new Map();
    return {
        map,
        get: async (k) => (map.has(k) ? map.get(k) : null),
        put: async (k, v) => { map.set(k, v); },
        remove: async (k) => { map.delete(k); },
    };
}

function fakeFetch(routes, calls) {
    return async (url) => {
        calls.push(url);
        const r = routes[url];
        if (r === 'offline') throw new TypeError('Failed to fetch');
        if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}) };
        if (r === undefined) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(r)) };
    };
}

const BASE = 'https://data.test/discovery';
const INDEX_URL = `${BASE}/index.json`;
const studyUrl = (lang, file) => `${BASE}/${lang}/${file}`;

function makeLoader(routes, cache = memoryCache()) {
    const calls = [];
    const loader = createDiscoveryData({ fetchWithRetry: fakeFetch(routes, calls), cache, baseUrl: BASE });
    return { loader, calls, cache };
}

test('loadIndex: fetches and parses for the language', async () => {
    const { loader } = makeLoader({ [INDEX_URL]: { studies: [entry()] } });
    const list = await loader.loadIndex('en');
    assert.equal(list.length, 1);
    assert.equal(list[0].file, 'love_en.json');
});

test('loadIndex: A5 an empty index resolves to an empty list (empty state, not an error)', async () => {
    const { loader } = makeLoader({ [INDEX_URL]: { studies: [] } });
    assert.deepEqual(await loader.loadIndex('en'), []);
});

test('loadIndex: A5 rejects when offline and nothing is cached', async () => {
    const { loader } = makeLoader({ [INDEX_URL]: 'offline' });
    await assert.rejects(loader.loadIndex('en'), /Failed to fetch/);
});

test('loadIndex: A5 rejects on an HTTP error with nothing cached', async () => {
    const { loader } = makeLoader({ [INDEX_URL]: 500 });
    await assert.rejects(loader.loadIndex('en'), /HTTP 500/);
});

test('loadIndex: rejects when the body is not JSON', async () => {
    const calls = [];
    const loader = createDiscoveryData({
        fetchWithRetry: async (u) => { calls.push(u); return { ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }; },
        cache: memoryCache(),
        baseUrl: BASE,
    });
    await assert.rejects(loader.loadIndex('en'), /bad json/);
});

test('loadIndex: A4 offline falls back to the last cached index', async () => {
    const cache = memoryCache();
    const online = makeLoader({ [INDEX_URL]: { studies: [entry()] } }, cache);
    await online.loader.loadIndex('en');
    const offline = makeLoader({ [INDEX_URL]: 'offline' }, cache);
    const list = await offline.loader.loadIndex('en');
    assert.equal(list[0].id, 'love_001');
});

test('loadStudy: fetches from discovery/{lang}/{file} and caches it', async () => {
    const url = studyUrl('en', 'love_en.json');
    const { loader, calls, cache } = makeLoader({ [url]: { id: 'love_001', cards: [] } });
    const [s] = parseIndex({ studies: [entry()] }, 'en');
    const data = await loader.loadStudy(s, 'en');
    assert.deepEqual(data, { id: 'love_001', cards: [] });
    assert.deepEqual(calls, [url]);
    assert.equal(cache.map.size, 1);
});

test('loadStudy: A4 same version is served from cache without a network call', async () => {
    const url = studyUrl('en', 'love_en.json');
    const cache = memoryCache();
    const first = makeLoader({ [url]: { n: 1 } }, cache);
    const [s] = parseIndex({ studies: [entry()] }, 'en');
    await first.loader.loadStudy(s, 'en');
    const second = makeLoader({ [url]: { n: 2 } }, cache);
    const data = await second.loader.loadStudy(s, 'en');
    assert.deepEqual(data, { n: 1 });
    assert.equal(second.calls.length, 0);
});

test('loadStudy: A4 a newer index version forces a refetch and replaces the cached copy', async () => {
    const url = studyUrl('en', 'love_en.json');
    const cache = memoryCache();
    const [v1] = parseIndex({ studies: [entry({ version: '1.2' })] }, 'en');
    const [v2] = parseIndex({ studies: [entry({ version: '1.3' })] }, 'en');
    await makeLoader({ [url]: { n: 1 } }, cache).loader.loadStudy(v1, 'en');
    const second = makeLoader({ [url]: { n: 2 } }, cache);
    assert.deepEqual(await second.loader.loadStudy(v2, 'en'), { n: 2 });
    assert.equal(second.calls.length, 1);
    assert.equal(cache.map.size, 1, 'old entry is replaced, not accumulated');
    const third = makeLoader({ [url]: 'offline' }, cache);
    assert.deepEqual(await third.loader.loadStudy(v2, 'en'), { n: 2 });
});

test('loadStudy: A4 offline with a stale cached copy still opens it', async () => {
    const url = studyUrl('en', 'love_en.json');
    const cache = memoryCache();
    const [v1] = parseIndex({ studies: [entry({ version: '1.2' })] }, 'en');
    const [v2] = parseIndex({ studies: [entry({ version: '1.3' })] }, 'en');
    await makeLoader({ [url]: { n: 1 } }, cache).loader.loadStudy(v1, 'en');
    const offline = makeLoader({ [url]: 'offline' }, cache);
    assert.deepEqual(await offline.loader.loadStudy(v2, 'en'), { n: 1 });
});

test('loadStudy: A5 rejects when offline with no cached copy', async () => {
    const url = studyUrl('en', 'love_en.json');
    const { loader } = makeLoader({ [url]: 'offline' });
    const [s] = parseIndex({ studies: [entry()] }, 'en');
    await assert.rejects(loader.loadStudy(s, 'en'), /Failed to fetch/);
});

test('loadStudy: a 404 is an error and is never cached', async () => {
    const { loader, cache } = makeLoader({});
    const [s] = parseIndex({ studies: [entry()] }, 'en');
    await assert.rejects(loader.loadStudy(s, 'en'), /HTTP 404/);
    assert.equal(cache.map.size, 0);
});

test('loadStudy: cache is isolated per language', async () => {
    const cache = memoryCache();
    const routes = {
        [studyUrl('en', 'love_en.json')]: { l: 'en' },
        [studyUrl('es', 'love_es.json')]: { l: 'es' },
    };
    const idx = { studies: [entry()] };
    const { loader } = makeLoader(routes, cache);
    const [en] = parseIndex(idx, 'en');
    const [es] = parseIndex(idx, 'es');
    assert.deepEqual(await loader.loadStudy(en, 'en'), { l: 'en' });
    assert.deepEqual(await loader.loadStudy(es, 'es'), { l: 'es' });
});

test('loadStudy: a throwing cache never breaks loading', async () => {
    const url = studyUrl('en', 'love_en.json');
    const broken = {
        get: async () => { throw new Error('quota'); },
        put: async () => { throw new Error('quota'); },
        remove: async () => { throw new Error('quota'); },
    };
    const { loader } = makeLoader({ [url]: { ok: true } }, broken);
    const [s] = parseIndex({ studies: [entry()] }, 'en');
    assert.deepEqual(await loader.loadStudy(s, 'en'), { ok: true });
});

test('loadStudy: rejects a study summary without a file', async () => {
    const { loader } = makeLoader({});
    await assert.rejects(loader.loadStudy({ id: 'x', version: '1', file: '' }, 'en'), /file/);
    await assert.rejects(loader.loadStudy(null, 'en'), /file/);
});

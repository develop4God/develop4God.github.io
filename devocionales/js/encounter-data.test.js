'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
// vm.runInThisContext (not new Function) so c8 attributes coverage to the real files.
for (const name of ['content-index.js', 'discovery-data.js', 'encounter-data.js']) {
    const filename = path.join(__dirname, name);
    const source = fs.readFileSync(filename, 'utf8');
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
}
const { parseIndex, createEncounterData, DEFAULT_MINUTES } = global.window.EncounterData;

const entry = (over = {}) => ({
    id: 'peter_water_001',
    version: '2.4',
    status: 'published',
    emoji: '🌊',
    accent_color: '#1e3a5f',
    mood_primary: 'storm',
    character: 'Peter',
    intro_image: 'peter_intro.png',
    files: { en: 'peter_en.json', es: 'peter_es.json' },
    titles: { en: 'Walked on Water', es: 'Caminó sobre el agua' },
    subtitles: { en: 'Faith', es: 'Fe' },
    scripture_reference: { en: 'Matthew 14:22-33', es: 'Mateo 14:22-33' },
    estimated_reading_minutes: { en: 5, es: 6 },
    ...over,
});
const soon = (over = {}) => entry({
    id: 'soon_001', status: 'coming_soon', files: {}, release_date: { en: 'Next week' }, ...over,
});
const list = (entries, lang = 'en') => parseIndex({ encounters: entries }, lang);

// ---- parseIndex (A1-A3) ----

test('parseIndex: maps a published entry for the language', () => {
    const [e] = list([entry()]);
    assert.deepEqual(e, {
        id: 'peter_water_001', version: '2.4', status: 'published', isPublished: true,
        emoji: '🌊', accent: '#1e3a5f', mood: 'storm', character: 'Peter',
        introImage: 'peter_intro.png', title: 'Walked on Water', subtitle: 'Faith',
        scripture: 'Matthew 14:22-33', minutes: 5, testament: '', releaseDate: '', file: 'peter_en.json',
    });
});

test('parseIndex: A1 hides a published entry without a file for the language (no fallback language)', () => {
    assert.equal(list([entry({ files: { es: 'x.json' } })]).length, 0);
    assert.equal(list([entry({ files: { en: '' } })]).length, 0);
});

test('parseIndex: A1 shows coming_soon without files when it has a title for the language, with release date', () => {
    const [s] = list([soon()]);
    assert.equal(s.isPublished, false);
    assert.equal(s.file, '');
    assert.equal(s.releaseDate, 'Next week');
});

test('parseIndex: A1 hides coming_soon with neither file nor title for the language', () => {
    assert.equal(list([soon({ titles: { es: 'Pronto' } })]).length, 0);
});

test('parseIndex: coming_soon release date falls back to en, then any value, then empty', () => {
    assert.equal(list([soon({ release_date: { en: 'E' } })], 'en')[0].releaseDate, 'E');
    assert.equal(list([soon({ titles: { es: 'x' }, release_date: { en: 'E' } })], 'es')[0].releaseDate, 'E');
    assert.equal(list([soon({ release_date: { fr: 'F' } })])[0].releaseDate, 'F');
    assert.equal(list([soon({ release_date: undefined })])[0].releaseDate, '');
});

test('parseIndex: A2 title falls back to en, then to the id; subtitle/scripture default to empty', () => {
    assert.equal(list([entry({ titles: { fr: 'x' }, files: { de: 'a.json' } })], 'de')[0].title, 'peter_water_001');
    assert.equal(list([entry({ titles: { en: 'EN' }, files: { de: 'a.json' } })], 'de')[0].title, 'EN');
    const [e] = list([entry({ subtitles: undefined, scripture_reference: null })]);
    assert.equal(e.subtitle, '');
    assert.equal(e.scripture, '');
});

test('parseIndex: A2 emoji defaults when missing or empty', () => {
    assert.equal(list([entry({ emoji: '' })])[0].emoji, '📖');
    assert.equal(list([entry({ emoji: undefined })])[0].emoji, '📖');
});

test('parseIndex: A2 reading minutes default to 5 when missing, zero, negative, NaN or non-numeric', () => {
    for (const bad of [undefined, null, {}, { en: 0 }, { en: -3 }, { en: 'abc' }, 'x']) {
        assert.equal(list([entry({ estimated_reading_minutes: bad })])[0].minutes, DEFAULT_MINUTES);
    }
    assert.equal(list([entry({ estimated_reading_minutes: { en: '8' } })])[0].minutes, 8);
});

test('parseIndex: A2 accent colour accepted only as #rrggbb, otherwise null', () => {
    for (const bad of ['red', '#fff', '#12345g', 123, undefined, '1e3a5f']) {
        assert.equal(list([entry({ accent_color: bad })])[0].accent, null);
    }
    assert.equal(list([entry({ accent_color: '#ABCDEF' })])[0].accent, '#ABCDEF');
});

test('parseIndex: A3 skips malformed entries without breaking the list', () => {
    const out = list([null, 'x', 7, [], {}, { id: '' }, entry({ id: 'no_status', status: undefined }),
        entry({ id: 'bad_status', status: 'draft' }), entry({ id: 'ok' })]);
    assert.deepEqual(out.map((e) => e.id), ['ok']);
});

test('parseIndex: A3 version defaults to "0" so cache keys stay stable', () => {
    assert.equal(list([entry({ version: undefined })])[0].version, '0');
    assert.equal(list([entry({ version: 3 })])[0].version, '3');
});

test('parseIndex: keeps index order', () => {
    assert.deepEqual(list([entry({ id: 'b' }), entry({ id: 'a' }), soon({ id: 'c' })]).map((e) => e.id), ['b', 'a', 'c']);
});

test('parseIndex: invalid roots or language return an empty list and never throw', () => {
    for (const root of [null, undefined, [], 'x', {}, { encounters: 'no' }, { studies: [entry()] }]) {
        assert.deepEqual(parseIndex(root, 'en'), []);
    }
    assert.deepEqual(parseIndex({ encounters: [entry()] }, ''), []);
    assert.deepEqual(parseIndex({ encounters: [entry()] }, undefined), []);
});

// ---- createEncounterData: wiring on the shared loader (A4, A5) ----

const BASE = 'https://cdn.test/encounters';
const memoryCache = () => {
    const m = new Map();
    return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, remove: async (k) => { m.delete(k); } };
};
const fakeFetch = (routes, calls) => async (url) => {
    calls.push(url);
    if (!(url in routes)) throw new Error('offline');
    return { ok: true, status: 200, json: async () => routes[url] };
};
function makeLoader(routes, cache = memoryCache()) {
    const calls = [];
    return { loader: createEncounterData({ fetchWithRetry: fakeFetch(routes, calls), cache, baseUrl: BASE }), calls, cache };
}

test('loadIndex: fetches the encounters index and parses it with encounter rules', async () => {
    const { loader } = makeLoader({ [`${BASE}/index.json`]: { encounters: [entry(), soon()] } });
    const out = await loader.loadIndex('en');
    assert.deepEqual(out.map((e) => e.id), ['peter_water_001', 'soon_001']);
});

test('loadIndex: A4 offline falls back to the cached index', async () => {
    const cache = memoryCache();
    await makeLoader({ [`${BASE}/index.json`]: { encounters: [entry()] } }, cache).loader.loadIndex('en');
    const { loader } = makeLoader({}, cache);
    assert.equal((await loader.loadIndex('en')).length, 1);
});

test('loadIndex: A5 rejects when offline with nothing cached', async () => {
    await assert.rejects(makeLoader({}).loader.loadIndex('en'));
});

test('loadStudy: A4 caches by id+version, refetches on a new version, serves stale offline', async () => {
    const url = `${BASE}/en/peter_en.json`;
    const cache = memoryCache();
    const first = makeLoader({ [url]: { cards: [1] } }, cache);
    const [e] = list([entry()]);
    assert.deepEqual(await first.loader.loadStudy(e, 'en'), { cards: [1] });
    const again = makeLoader({ [url]: { cards: [2] } }, cache);
    assert.deepEqual(await again.loader.loadStudy(e, 'en'), { cards: [1] });
    assert.equal(again.calls.length, 0);
    const newer = { ...e, version: '2.5' };
    assert.deepEqual(await again.loader.loadStudy(newer, 'en'), { cards: [2] });
    assert.deepEqual(await makeLoader({}, cache).loader.loadStudy({ ...e, version: '9' }, 'en'), { cards: [2] });
});

test('loadStudy: rejects for an entry without a file (coming_soon)', async () => {
    await assert.rejects(makeLoader({}).loader.loadStudy(list([soon()])[0], 'en'));
});

test('parseIndex: keeps a valid testament and drops anything else', () => {
    const base = { id: 'b', status: 'published', files: { en: 'b_en.json' }, titles: { en: 'B' } };
    const [oldOne] = parseIndex({ encounters: [{ ...base, testament: 'old' }] }, 'en');
    const [newOne] = parseIndex({ encounters: [{ ...base, testament: 'new' }] }, 'en');
    const [other] = parseIndex({ encounters: [{ ...base, testament: 'apocrypha' }] }, 'en');
    assert.equal(oldOne.testament, 'old');
    assert.equal(newOne.testament, 'new');
    assert.equal(other.testament, '');
});

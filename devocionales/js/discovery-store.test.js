'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'discovery-store.js');
const source = fs.readFileSync(filename, 'utf8');
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { createDiscoveryStore, KEYS } = global.window.DiscoveryStore;

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: (k) => { delete data[k]; },
    };
}

const throwingStorage = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('SecurityError'); },
};

// ---- keys mirror the Flutter writer (discovery_progress_tracker / favorites / bloc) ----

test('KEYS mirror the app: progress_<id>_<lang>, favorite_ids_<lang>, seen_studies', () => {
    assert.equal(KEYS.progress('love_001', 'en'), 'discovery_progress_love_001_en');
    assert.equal(KEYS.favorites('en'), 'discovery_favorite_ids_en');
    assert.equal(KEYS.seen, 'discovery_seen_studies');
});

test('KEYS.favorites normalises en-US to en like the app', () => {
    assert.equal(KEYS.favorites('en-US'), 'discovery_favorite_ids_en');
    assert.equal(KEYS.favorites('PT-br'), 'discovery_favorite_ids_pt');
});

// ---- progress (D1) ----

test('getProgress: defaults for an unknown study', () => {
    const s = createDiscoveryStore(memoryStorage());
    assert.deepEqual(s.getProgress('a', 'en'), {
        studyId: 'a', languageCode: 'en', completedSections: [], isCompleted: false, completedAt: null, totalSections: null,
    });
});

test('markSectionCompleted: records a section once, never duplicates', () => {
    const s = createDiscoveryStore(memoryStorage());
    s.markSectionCompleted('a', 2, 'en');
    s.markSectionCompleted('a', 2, 'en');
    s.markSectionCompleted('a', 0, 'en');
    assert.deepEqual(s.getProgress('a', 'en').completedSections, [2, 0]);
});

test('markSectionCompleted: ignores non-integer or negative indices', () => {
    const s = createDiscoveryStore(memoryStorage());
    for (const bad of [-1, 1.5, NaN, '2', null, undefined]) s.markSectionCompleted('a', bad, 'en');
    assert.deepEqual(s.getProgress('a', 'en').completedSections, []);
});

test('progress is isolated per language and per study', () => {
    const s = createDiscoveryStore(memoryStorage());
    s.markSectionCompleted('a', 1, 'en');
    assert.deepEqual(s.getProgress('a', 'es').completedSections, []);
    assert.deepEqual(s.getProgress('b', 'en').completedSections, []);
});

test('completeStudy: sets the flag and a timestamp once; repeated calls keep the first timestamp', () => {
    const clock = [new Date('2026-01-01T00:00:00Z'), new Date('2026-02-02T00:00:00Z')];
    const s = createDiscoveryStore(memoryStorage(), () => clock.shift());
    s.completeStudy('a', 'en');
    s.completeStudy('a', 'en');
    const p = s.getProgress('a', 'en');
    assert.equal(p.isCompleted, true);
    assert.equal(p.completedAt, '2026-01-01T00:00:00.000Z');
});

test('resetProgress: removes the study so it can be redone; other studies untouched', () => {
    const s = createDiscoveryStore(memoryStorage());
    s.completeStudy('a', 'en');
    s.completeStudy('b', 'en');
    s.resetProgress('a', 'en');
    assert.equal(s.getProgress('a', 'en').isCompleted, false);
    assert.equal(s.getProgress('b', 'en').isCompleted, true);
});

test('completionPercentage: sections / total, 0 for total 0, capped at 1', () => {
    const s = createDiscoveryStore(memoryStorage());
    s.markSectionCompleted('a', 0, 'en');
    s.markSectionCompleted('a', 1, 'en');
    assert.equal(s.completionPercentage('a', 4, 'en'), 0.5);
    assert.equal(s.completionPercentage('a', 0, 'en'), 0);
    assert.equal(s.completionPercentage('a', 1, 'en'), 1);
});

test('setTotalSections: stores the card count so the list can show 7/14 = 50% without loading the study', () => {
    const s = createDiscoveryStore(memoryStorage());
    s.setTotalSections('a', 14, 'en');
    for (let i = 0; i < 7; i++) s.markSectionCompleted('a', i, 'en');
    assert.equal(s.getProgress('a', 'en').totalSections, 14);
    assert.equal(s.completionPercentage('a', s.getProgress('a', 'en').totalSections, 'en'), 0.5);
});

test('setTotalSections: ignores zero, negative, fractional and non-numeric totals', () => {
    const s = createDiscoveryStore(memoryStorage());
    for (const bad of [0, -2, 2.5, NaN, '14', null, undefined]) s.setTotalSections('a', bad, 'en');
    assert.equal(s.getProgress('a', 'en').totalSections, null);
});

test('setTotalSections: keeps completed sections and survives later writes', () => {
    const s = createDiscoveryStore(memoryStorage());
    s.markSectionCompleted('a', 1, 'en');
    s.setTotalSections('a', 6, 'en');
    s.markSectionCompleted('a', 2, 'en');
    const p = s.getProgress('a', 'en');
    assert.deepEqual(p.completedSections, [1, 2]);
    assert.equal(p.totalSections, 6);
});

test('getProgress: a non-numeric stored totalSections reads as null', () => {
    const key = KEYS.progress('a', 'en');
    const s = createDiscoveryStore(memoryStorage({ [key]: JSON.stringify({ totalSections: 'many' }) }));
    assert.equal(s.getProgress('a', 'en').totalSections, null);
});

test('getProgress: corrupt JSON, wrong shapes and wrong types fall back to defaults', () => {
    const key = KEYS.progress('a', 'en');
    for (const raw of ['{not json', 'null', '[]', '"str"', '42', '', JSON.stringify({ completedSections: 'x', isCompleted: 'yes' })]) {
        const s = createDiscoveryStore(memoryStorage({ [key]: raw }));
        const p = s.getProgress('a', 'en');
        assert.deepEqual(p.completedSections, [], raw);
        assert.equal(p.isCompleted, false, raw);
    }
});

test('getProgress: reads what the Flutter app wrote (shared schema)', () => {
    const key = KEYS.progress('a', 'en');
    const written = JSON.stringify({
        studyId: 'a', languageCode: 'en', completedSections: [0, 1, 3],
        answeredQuestions: { 0: 'x' }, isCompleted: true, completedAt: '2026-03-03T10:00:00.000',
    });
    const p = createDiscoveryStore(memoryStorage({ [key]: written })).getProgress('a', 'en');
    assert.deepEqual(p.completedSections, [0, 1, 3]);
    assert.equal(p.isCompleted, true);
    assert.equal(p.completedAt, '2026-03-03T10:00:00.000');
});

test('writes keep fields they do not own (answeredQuestions)', () => {
    const key = KEYS.progress('a', 'en');
    const st = memoryStorage({ [key]: JSON.stringify({ studyId: 'a', answeredQuestions: { 1: 'keep' } }) });
    createDiscoveryStore(st).markSectionCompleted('a', 2, 'en');
    assert.deepEqual(JSON.parse(st.data[key]).answeredQuestions, { 1: 'keep' });
});

// ---- favourites (D2) ----

test('toggleFavorite: adds (true) then removes (false); isFavorite reflects it', () => {
    const s = createDiscoveryStore(memoryStorage());
    assert.equal(s.toggleFavorite('a', 'en'), true);
    assert.equal(s.loadFavorites('en').has('a'), true);
    assert.equal(s.toggleFavorite('a', 'en'), false);
    assert.equal(s.loadFavorites('en').has('a'), false);
});

test('favourites are isolated per language', () => {
    const s = createDiscoveryStore(memoryStorage());
    s.toggleFavorite('a', 'en');
    assert.equal(s.loadFavorites('es').size, 0);
});

test('loadFavorites: corrupt or non-array JSON and non-string members are ignored', () => {
    const key = KEYS.favorites('en');
    for (const raw of ['{x', '{}', 'null', '5']) {
        assert.equal(createDiscoveryStore(memoryStorage({ [key]: raw })).loadFavorites('en').size, 0, raw);
    }
    const mixed = createDiscoveryStore(memoryStorage({ [key]: JSON.stringify(['a', 3, null, 'b']) }));
    assert.deepEqual([...mixed.loadFavorites('en')].sort(), ['a', 'b']);
});

// ---- seen (B7: "New" = not opened yet; global, like the app) ----

test('markSeen: stores once, global across languages', () => {
    const st = memoryStorage();
    const s = createDiscoveryStore(st);
    s.markSeen('a');
    s.markSeen('a');
    s.markSeen('b');
    assert.deepEqual(JSON.parse(st.data[KEYS.seen]), ['a', 'b']);
    assert.equal(s.loadSeen().has('a'), true);
});

test('markSeen: ignores empty or non-string ids; corrupt stored value recovers', () => {
    const st = memoryStorage({ [KEYS.seen]: '{broken' });
    const s = createDiscoveryStore(st);
    s.markSeen('');
    s.markSeen(null);
    assert.equal(s.loadSeen().size, 0);
    s.markSeen('a');
    assert.deepEqual([...s.loadSeen()], ['a']);
});

// ---- blocked storage never breaks rendering (D2) ----

test('blocked storage: reads return defaults and writes do not throw', () => {
    const s = createDiscoveryStore(throwingStorage);
    assert.equal(s.getProgress('a', 'en').isCompleted, false);
    assert.equal(s.loadFavorites('en').size, 0);
    assert.equal(s.loadSeen().size, 0);
    assert.doesNotThrow(() => {
        s.markSectionCompleted('a', 1, 'en');
        s.completeStudy('a', 'en');
        s.resetProgress('a', 'en');
        s.markSeen('a');
    });
    assert.equal(s.toggleFavorite('a', 'en'), false, 'a failed write reports not-added');
});

test('missing storage (undefined) behaves like blocked storage', () => {
    const s = createDiscoveryStore(undefined);
    assert.equal(s.loadFavorites('en').size, 0);
    assert.doesNotThrow(() => s.markSeen('a'));
});

test('swipe hint: unseen by default, remembered once marked, and storage failures never throw', () => {
    const storage = memoryStorage();
    const s = createDiscoveryStore(storage);
    assert.equal(s.hasSeenSwipeHint(), false);
    s.markSwipeHintSeen();
    s.markSwipeHintSeen();
    assert.equal(s.hasSeenSwipeHint(), true);
    assert.equal(createDiscoveryStore(storage).hasSeenSwipeHint(), true, 'survives a new store over the same storage');
    const broken = createDiscoveryStore(throwingStorage);
    assert.doesNotThrow(() => broken.markSwipeHintSeen());
    assert.equal(broken.hasSeenSwipeHint(), false);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// devotional-progress.js is a browser IIFE that attaches to `window`.
// Node has no `window`/`localStorage`; supply real, in-memory-backed stand-ins
// so the module's actual localStorage calls run against real behavior.
global.window = global.window || {};
const store = {};
global.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
};

const filename = path.join(__dirname, 'devotional-progress.js');
const source = fs.readFileSync(filename, 'utf8');
// vm.runInThisContext (not new Function) so c8/V8 can attribute coverage
// back to this real filename instead of an anonymous eval.
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const {
    todayKey,
    devotionalFileYear,
    daysBetween,
    addDays,
    loadProgress,
    saveProgress,
    resolveDefaultDate,
} = global.window.DevotionalProgress;

test('todayKey: matches the real local calendar date', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    assert.equal(todayKey(), expected);
});

test('devotionalFileYear: Aug-Dec belongs to the current calendar year\'s file', () => {
    assert.equal(devotionalFileYear(new Date(2025, 7, 1)), 2025); // Aug 1
    assert.equal(devotionalFileYear(new Date(2025, 11, 31)), 2025); // Dec 31
});

test('devotionalFileYear: Jan-Jul belongs to the previous calendar year\'s file', () => {
    assert.equal(devotionalFileYear(new Date(2026, 0, 1)), 2025); // Jan 1
    assert.equal(devotionalFileYear(new Date(2026, 6, 31)), 2025); // Jul 31
});

test('daysBetween: counts whole calendar days regardless of DST boundaries', () => {
    assert.equal(daysBetween('2026-01-01', '2026-01-01'), 0);
    assert.equal(daysBetween('2026-01-01', '2026-01-02'), 1);
    assert.equal(daysBetween('2026-01-01', '2026-02-01'), 31);
    // Northern-hemisphere spring-forward/fall-back: still exactly 1 day.
    assert.equal(daysBetween('2026-03-07', '2026-03-08'), 1);
    assert.equal(daysBetween('2026-11-01', '2026-11-02'), 1);
});

test('addDays: advances and retreats across month/year boundaries', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2026-01-01', 0), '2026-01-01');
});

test('addDays and daysBetween are inverse operations', () => {
    const start = '2026-05-15';
    for (const delta of [1, 7, 30, 365, -1, -30]) {
        const moved = addDays(start, delta);
        assert.equal(daysBetween(start, moved), delta);
    }
});

test('loadProgress: returns null when nothing is stored, or on corrupt JSON', () => {
    store['devotionalProgress'] = undefined;
    delete store['devotionalProgress'];
    assert.equal(loadProgress(), null);

    store['devotionalProgress'] = 'not-json{{{';
    assert.equal(loadProgress(), null);
});

test('saveProgress + loadProgress: round-trips real localStorage data', () => {
    saveProgress('2026-01-01', '2026-01-05');
    assert.deepEqual(loadProgress(), { startDate: '2026-01-01', firstVisitDate: '2026-01-05' });
});

test('resolveDefaultDate: first-ever visit persists earliest date as day-1 and returns it', async () => {
    delete store['devotionalProgress'];
    const findEarliestDate = async () => '2020-08-01';
    const findLatestDate = async () => '2026-07-25';

    const result = await resolveDefaultDate({ findEarliestDate, findLatestDate });

    assert.equal(result, '2020-08-01');
    assert.deepEqual(loadProgress().startDate, '2020-08-01');
});

test('resolveDefaultDate: returning visitor advances by real elapsed calendar days since first visit', async () => {
    const today = todayKey();
    const tenDaysAgo = addDays(today, -10);
    saveProgress('2020-08-01', tenDaysAgo);
    const findEarliestDate = async () => { throw new Error('should not be called when progress already exists'); };
    const findLatestDate = async () => '2099-01-01';

    const result = await resolveDefaultDate({ findEarliestDate, findLatestDate });

    assert.equal(result, addDays('2020-08-01', 10));
});

test('resolveDefaultDate: caps at the latest available content when progress has run ahead of the archive', async () => {
    const today = todayKey();
    saveProgress('2020-08-01', addDays(today, -5000));
    const findEarliestDate = async () => { throw new Error('should not be called when progress already exists'); };
    const findLatestDate = async () => '2020-08-10';

    const result = await resolveDefaultDate({ findEarliestDate, findLatestDate });

    assert.equal(result, '2020-08-10');
});

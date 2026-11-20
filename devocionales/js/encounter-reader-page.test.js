'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const name of ['discovery-cards.js', 'discovery-progress.js', 'discovery-hero-dom.js', 'discovery-nav.js', 'encounter-reader-page.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createReaderPage } = global.window.EncounterReaderPage;

// Shaped like the real encounter file (devocionales-json/encounters/en/*.json): key verse object,
// cards with `order`, completion card last, bible_version at top level.
const SAMPLE = {
    id: 'bartimaeus_001',
    bible_version: 'KJ2000',
    key_verse: { reference: 'Mark 10:46', text: 'And they came to Jericho', bible_version: 'KJ2000' },
    cards: [
        { order: 2, type: 'scripture_moment', title: 'second' },
        { order: 1, type: 'cinematic_scene', title: 'first' },
        { order: 3, type: 'completion', completion_verse: { reference: 'Mark 10:52', text: 'Go thy way' } },
    ],
};
const SUMMARY = { id: 'bartimaeus_001', version: '1.1', file: 'bartimaeus_en_001.json', isPublished: true, title: 'Bartimaeus' };

function fakeTimers() {
    const queue = [];
    return {
        setTimeout: (fn, ms) => { queue.push({ fn, ms, cleared: false }); return queue.length - 1; },
        clearTimeout: (id) => { if (queue[id]) queue[id].cleared = true; },
        fire: () => queue.filter((t) => !t.cleared).forEach((t) => t.fn()),
        pending: () => queue.filter((t) => !t.cleared).map((t) => t.ms),
    };
}

function setup({ study = SAMPLE, loadError = null, completed = false, timers = fakeTimers() } = {}) {
    const calls = { rendered: [], completed: [], exits: 0, celebrated: 0, loaded: [], toasts: [] };
    const state = { isCompleted: completed };
    const dom = {
        buildPage: (page) => ({ kind: page.kind, sectionIndex: page.sectionIndex, isLast: page.isLast }),
        buildCompletion: ({ onComplete, isCompleted }) => ({ onComplete, isCompleted }),
    };
    const page = createReaderPage({
        view: { render: (p) => calls.rendered.push(p) },
        lang: () => 'en',
        data: {
            loadEncounter: async (summary, lang) => {
                calls.loaded.push([summary.id, lang]);
                if (loadError) throw loadError;
                return study;
            },
        },
        store: {
            isCompleted: () => state.isCompleted,
            markCompleted: (id) => { calls.completed.push(id); state.isCompleted = true; },
        },
        dom,
        timers,
        celebrate: () => { calls.celebrated += 1; },
        toast: { show: (msg) => calls.toasts.push(msg) },
        completedMessage: 'Encounter completed successfully',
        onExit: () => { calls.exits += 1; },
        copyright: (lang, bibleVersion) => `copyright:${lang}:${bibleVersion}`,
    });
    return { page, calls, timers, state };
}

const last = (calls) => calls.rendered[calls.rendered.length - 1];

test('paging: the key verse comes first, then the cards in order, and the completion card is last', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    const kinds = last(calls).pages;
    assert.deepEqual(kinds.map((p) => p.kind), ['keyVerse', 'card', 'card', 'card']);
    assert.deepEqual(kinds.map((p) => p.sectionIndex), [null, 0, 1, 2]);
    assert.equal(kinds[kinds.length - 1].isLast, true);
});

test('next and prev move one page and never past either end', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    page.next();
    assert.equal(last(calls).index, 1);
    page.prev();
    assert.equal(last(calls).index, 0);
    page.prev(); // already first: no-op
    assert.equal(last(calls).index, 0);
    for (let i = 0; i < 10; i += 1) page.next();
    assert.equal(last(calls).index, 3);
});

test('paging to the completion card does not complete the encounter', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    page.goTo(3);
    assert.equal(last(calls).index, 3);
    assert.deepEqual(calls.completed, []);
});

test('completing shows the same completion toast as Bible studies, with the encounter wording', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    page.goTo(3);
    page.complete();
    assert.deepEqual(calls.toasts, ['Encounter completed successfully']);
});

test('a second press does not repeat the completion toast', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    page.goTo(3);
    page.complete();
    page.complete();
    assert.equal(calls.toasts.length, 1);
});

test('completing marks the encounter once, celebrates, and starts the 5 s return', async () => {
    const { page, calls, timers } = setup();
    await page.open(SUMMARY);
    page.goTo(3);
    page.complete();
    assert.deepEqual(calls.completed, ['bartimaeus_001']);
    assert.equal(calls.celebrated, 1);
    assert.deepEqual(timers.pending(), [5000]);
});

test('a second complete press does nothing (press-once)', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    page.goTo(3);
    page.complete();
    page.complete();
    assert.deepEqual(calls.completed, ['bartimaeus_001']);
    assert.equal(calls.celebrated, 1);
});

test('after the 5 s the reader exits to the list', async () => {
    const { page, calls, timers } = setup();
    await page.open(SUMMARY);
    page.goTo(3);
    page.complete();
    assert.equal(calls.exits, 0);
    timers.fire();
    assert.equal(calls.exits, 1);
});

test('leaving early (exit before the completion card) never marks the encounter completed', async () => {
    const { page, calls, timers } = setup();
    await page.open(SUMMARY);
    page.goTo(1);
    page.exit();
    timers.fire();
    assert.deepEqual(calls.completed, []);
    assert.equal(calls.celebrated, 0);
});

test('an encounter already completed shows the completed footer and cannot be completed again', async () => {
    const { page, calls } = setup({ completed: true });
    await page.open(SUMMARY);
    page.goTo(3);
    assert.equal(last(calls).footer.isCompleted, true);
    page.complete();
    assert.deepEqual(calls.completed, []);
});

test('a card with an unknown type still renders (the page is built, not dropped)', async () => {
    const study = { ...SAMPLE, cards: [{ order: 1, type: 'future_type', title: 'x' }] };
    const { page, calls } = setup({ study });
    await page.open(SUMMARY);
    assert.deepEqual(last(calls).pages.map((p) => p.kind), ['keyVerse', 'card']);
});

test('a study without cards shows the not-found state, not a blank reader', async () => {
    const { page, calls } = setup({ study: { id: 'x', cards: [] } });
    await page.open(SUMMARY);
    assert.equal(last(calls).notFound, true);
});

test('a failed load shows the error state and does not complete anything', async () => {
    const { page, calls } = setup({ loadError: new Error('offline') });
    await page.open(SUMMARY);
    assert.equal(last(calls).error, true);
    assert.deepEqual(calls.completed, []);
});

test('the copyright uses the encounter bible_version, not a per-card value', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    page.goTo(3);
    assert.equal(last(calls).footer.copyright, 'copyright:en:KJ2000');
});

test('loads the encounter in the reader language', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    assert.deepEqual(calls.loaded, [['bartimaeus_001', 'en']]);
});

test('a late load for a previous encounter cannot replace the current one', async () => {
    let resolveFirst;
    const first = new Promise((r) => { resolveFirst = r; });
    const calls = { rendered: [] };
    const page = createReaderPage({
        view: { render: (p) => calls.rendered.push(p) },
        lang: () => 'en',
        data: { loadEncounter: (summary) => (summary.id === 'slow' ? first : Promise.resolve({ id: summary.id, cards: [{ order: 1, type: 'cinematic_scene' }] })) },
        store: { isCompleted: () => false, markCompleted: () => {} },
        dom: { buildPage: (p) => p, buildCompletion: () => ({}) },
        timers: fakeTimers(),
        celebrate: () => {},
        toast: () => {},
        onExit: () => {},
        copyright: () => '',
    });
    const slow = page.open({ id: 'slow', file: 'slow.json' });
    await page.open({ id: 'fast', file: 'fast.json' });
    resolveFirst(SAMPLE);
    await slow;
    const shown = calls.rendered[calls.rendered.length - 1];
    assert.equal(shown.summary.id, 'fast');
});

test('keyboard next/prev follows RTL: arrow keys mirror in Arabic', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    page.enter();
    page.onKey('ArrowRight', { rtl: true });
    assert.equal(last(calls).index, 0); // in RTL ArrowRight means previous: already first
    page.onKey('ArrowLeft', { rtl: true });
    assert.equal(last(calls).index, 1);
});

test('C0: opening shows the intro first; enter() starts the reader at the key verse', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    assert.equal(last(calls).phase, 'intro');
    page.enter();
    assert.equal(last(calls).phase, 'reader');
    assert.equal(last(calls).index, 0);
});

test('C0: the intro is shown on every open, not only the first', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    page.enter();
    page.goTo(2);
    await page.open(SUMMARY);
    assert.equal(last(calls).phase, 'intro');
    assert.equal(last(calls).index, 0);
});

test('paging keys are ignored while the intro is showing', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    page.onKey('ArrowLeft');
    assert.equal(last(calls).index, 0);
    assert.equal(last(calls).phase, 'intro');
});

test('the intro carries the encounter header fields from the summary', async () => {
    const { page, calls } = setup();
    await page.open({ ...SUMMARY, title: 'Bartimaeus', scripture: 'Mark 10:46-52', minutes: 7, testament: 'new' });
    assert.equal(last(calls).intro.title, 'Bartimaeus');
    assert.equal(last(calls).intro.id, 'bartimaeus_001', 'the intro needs the id to build its image URL');
    assert.equal(last(calls).intro.minutes, 7);
    assert.equal(last(calls).intro.testament, 'new');
});

test('canGo: only in the reader phase, and only within the page bounds', async () => {
    const { page } = setup();
    await page.open(SUMMARY);
    assert.equal(page.canGo('next'), false, 'intro: no paging yet');
    page.enter();
    assert.equal(page.canGo('prev'), false, 'first page');
    assert.equal(page.canGo('next'), true);
    page.goTo(3);
    assert.equal(page.canGo('next'), false, 'last page');
    assert.equal(page.canGo('prev'), true);
});

test('leaving before the 5 s return cancels it: the reader exits once, not again later', async () => {
    const { page, calls, timers } = setup();
    await page.open(SUMMARY);
    page.goTo(3);
    page.complete();
    page.exit();
    timers.fire();
    assert.equal(calls.exits, 1);
});

test('opening another encounter cancels a pending return from the previous one', async () => {
    const { page, calls, timers } = setup();
    await page.open(SUMMARY);
    page.goTo(3);
    page.complete();
    await page.open({ ...SUMMARY, id: 'other_001' });
    timers.fire();
    assert.equal(calls.exits, 0, 'a stale timer must not navigate away from the new encounter');
});

test('reset() drops the current encounter: keys no longer page it and a pending return is cancelled', async () => {
    const { page, calls, timers } = setup();
    await page.open(SUMMARY);
    page.enter();
    page.goTo(3);
    page.complete();
    page.reset();
    const before = calls.rendered.length;
    page.onKey('ArrowLeft');
    timers.fire();
    assert.equal(calls.rendered.length, before, 'no render after reset');
    assert.equal(calls.exits, 0);
});

// ---- section progress (shared store): records card pages only, resumes at the first unread card ----
function progressFake(initial = {}) {
    const calls = { totals: [], marked: [] };
    const data = { sections: [...(initial.sections || [])], total: initial.total || null };
    return {
        calls,
        getProgress: () => ({ completedSections: [...data.sections], totalSections: data.total }),
        setTotalSections: (id, total) => { calls.totals.push([id, total]); data.total = total; },
        markSectionCompleted: (id, index) => { calls.marked.push([id, index]); if (!data.sections.includes(index)) data.sections.push(index); },
    };
}

function setupProgress(progress, { loadGate = null, completed = false, study = SAMPLE } = {}) {
    const { calls, timers, state } = setup({ completed });
    // Rebuild with the progress dependency: the same page wiring, plus `progress`.
    const rebuilt = createReaderPage({
        view: { render: (p) => calls.rendered.push(p) },
        lang: () => 'en',
        data: { loadEncounter: async () => { if (loadGate) await loadGate; return study; } },
        store: { isCompleted: () => state.isCompleted, markCompleted: () => {} },
        dom: {},
        timers,
        celebrate: () => {},
        toast: { show: () => {} },
        completedMessage: 'done',
        onExit: () => {},
        copyright: () => '',
        progress,
    });
    return { page: rebuilt, calls };
}

test('progress: merely opening an encounter writes nothing; the total is stored with the first recorded section', async () => {
    const progress = progressFake();
    const { page } = setupProgress(progress);
    await page.open(SUMMARY);
    assert.deepEqual(progress.calls.totals, []);
    page.enter();
    page.next(); // card 0: the first recorded section
    assert.deepEqual(progress.calls.totals, [[SUMMARY.id, 3]], 'the key-verse page is not a section');
    page.next(); // card 1: the total is already right, no second write
    assert.equal(progress.calls.totals.length, 1);
});

test('progress: the intro and the key-verse page record nothing; enter() on a fresh encounter starts at page 0 without recording it', async () => {
    const progress = progressFake();
    const { page } = setupProgress(progress);
    await page.open(SUMMARY);
    assert.deepEqual(progress.calls.marked, []);
    page.enter();
    assert.deepEqual(progress.calls.marked, []);
});

test('progress: moving onto a card records that section; moving back to the key verse records nothing more', async () => {
    const progress = progressFake();
    const { page } = setupProgress(progress);
    await page.open(SUMMARY);
    page.enter();
    page.next(); // card 0
    assert.deepEqual(progress.calls.marked, [[SUMMARY.id, 0]]);
    page.prev(); // key verse
    assert.deepEqual(progress.calls.marked, [[SUMMARY.id, 0]]);
});

test('progress: enter() resumes at the first unread card, not at the start', async () => {
    const progress = progressFake({ sections: [0], total: 3 });
    const { page, calls } = setupProgress(progress);
    await page.open(SUMMARY);
    page.enter();
    assert.equal(last(calls).index, 2); // key verse, card 0 (read), card 1 -> index 2
    assert.deepEqual(progress.calls.marked, [[SUMMARY.id, 1]]);
});

test('progress: when every card is read but the encounter is not completed, enter() opens on the completion card', async () => {
    const progress = progressFake({ sections: [0, 1, 2], total: 3 });
    const { page, calls } = setupProgress(progress);
    await page.open(SUMMARY);
    page.enter();
    assert.equal(last(calls).index, 3);
});

test('progress: a load superseded by reset() records nothing when it finally arrives', async () => {
    const progress = progressFake();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { page } = setupProgress(progress, { loadGate: gate });
    const opening = page.open(SUMMARY);
    page.reset();
    release();
    await opening;
    page.enter();
    assert.deepEqual(progress.calls.totals, []);
    assert.deepEqual(progress.calls.marked, []);
});

test('progress: without a progress store the reader behaves exactly as before (old cached pages)', async () => {
    const { page, calls } = setup();
    await page.open(SUMMARY);
    page.enter();
    page.next();
    assert.equal(last(calls).index, 1);
});

test('intro bypass: an encounter with progress opens straight into the reader, no intro screen', async () => {
    const progress = progressFake({ sections: [0], total: 3 });
    const { page, calls } = setupProgress(progress);
    await page.open(SUMMARY);
    assert.equal(last(calls).phase, 'reader');
});

test('intro bypass: an encounter without progress still shows the intro first', async () => {
    const progress = progressFake();
    const { page, calls } = setupProgress(progress);
    await page.open(SUMMARY);
    assert.equal(last(calls).phase, 'intro');
});

test('intro bypass: a completed encounter reopens on the intro even though all its sections are recorded', async () => {
    const progress = progressFake({ sections: [0, 1, 2], total: 3 });
    const { page, calls } = setupProgress(progress, { completed: true });
    await page.open(SUMMARY);
    assert.equal(last(calls).phase, 'intro');
    page.enter();
    assert.equal(last(calls).index, 0, 'a completed encounter read again starts at the beginning');
});

test('resume: cards recorded from a longer version never send a shorter one straight to the completion card', async () => {
    // Six sections read in the longer version (indexes 1-6); this version has cards 0-2 and no key verse.
    const noKeyVerse = { ...SAMPLE, key_verse: undefined };
    const progress = progressFake({ sections: [1, 2, 3, 4, 5, 6], total: 7 });
    const { page, calls } = setupProgress(progress, { study: noKeyVerse });
    await page.open(SUMMARY);
    page.enter();
    assert.equal(last(calls).index, 0, 'card 0 was never read, so the reader opens there, not on the last page');
});

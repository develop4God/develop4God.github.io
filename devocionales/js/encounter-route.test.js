'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const name of ['encounter-route.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { routeFor } = global.window.EncounterRoute;

// Cards as EncounterCards.buildCards returns them: state is open | completed | locked | comingSoon.
const cards = [
    { id: 'a', state: 'completed' },
    { id: 'b', state: 'open' },
    { id: 'c', state: 'locked' },
    { id: 's', state: 'comingSoon' },
];

test('an open or completed encounter opens the reader', () => {
    assert.deepEqual(routeFor(cards, 'b'), { kind: 'open', entry: cards[1] });
    assert.deepEqual(routeFor(cards, 'a'), { kind: 'open', entry: cards[0] });
});

test('a locked encounter is routed to the unlock sheet, not the reader', () => {
    assert.deepEqual(routeFor(cards, 'c'), { kind: 'locked', entry: cards[2] });
});

test('a coming-soon encounter is routed to the coming-soon state', () => {
    assert.deepEqual(routeFor(cards, 's'), { kind: 'comingSoon', entry: cards[3] });
});

test('an unknown id is not found', () => {
    assert.deepEqual(routeFor(cards, 'nope'), { kind: 'notFound' });
});

test('a missing id or a broken list is not found, never a throw', () => {
    assert.deepEqual(routeFor(cards, null), { kind: 'notFound' });
    assert.deepEqual(routeFor(cards, ''), { kind: 'notFound' });
    assert.deepEqual(routeFor(undefined, 'a'), { kind: 'notFound' });
    assert.deepEqual(routeFor([null, { id: 'a', state: 'open' }], 'a'), { kind: 'open', entry: { id: 'a', state: 'open' } });
});

// createDeepLink: runs a deep link after its card list loads and decides which screen to show.
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function recorder() {
    const calls = [];
    const actions = {
        showList: () => calls.push(['showList']),
        openReader: (entry) => calls.push(['openReader', entry.id]),
        showLocked: () => calls.push(['showLocked']),
        showNotFound: (id) => calls.push(['showNotFound', id]),
    };
    return { calls, actions };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('deep link: an open encounter opens the reader once the list loads', async () => {
    const { calls, actions } = recorder();
    const link = global.window.EncounterRoute.createDeepLink({ loadCards: async () => cards, actions });
    await link.open('b');
    assert.deepEqual(calls, [['openReader', 'b']]);
});

test('deep link: a locked encounter shows the locked state, a coming-soon one shows the list', async () => {
    const { calls, actions } = recorder();
    const link = global.window.EncounterRoute.createDeepLink({ loadCards: async () => cards, actions });
    await link.open('c');
    await link.open('s');
    assert.deepEqual(calls, [['showLocked'], ['showList']]);
});

test('deep link: an unknown id shows not found with the id', async () => {
    const { calls, actions } = recorder();
    const link = global.window.EncounterRoute.createDeepLink({ loadCards: async () => cards, actions });
    await link.open('nope');
    assert.deepEqual(calls, [['showNotFound', 'nope']]);
});

test('deep link: a load failure shows the list, which offers its own retry', async () => {
    const { calls, actions } = recorder();
    const link = global.window.EncounterRoute.createDeepLink({ loadCards: async () => { throw new Error('offline'); }, actions });
    await link.open('b');
    assert.deepEqual(calls, [['showList']]);
});

test('deep link (bug): a load that finishes after the user left the detail view opens nothing', async () => {
    const { calls, actions } = recorder();
    const pending = deferred();
    const link = global.window.EncounterRoute.createDeepLink({ loadCards: () => pending.promise, actions });
    const opened = link.open('b');
    link.cancel(); // user pressed Back to the list
    pending.resolve(cards);
    await opened;
    assert.deepEqual(calls, []);
});

test('deep link (bug): a load that fails after the user left the list is ignored too', async () => {
    const { calls, actions } = recorder();
    const pending = deferred();
    const link = global.window.EncounterRoute.createDeepLink({ loadCards: () => pending.promise, actions });
    const opened = link.open('b');
    link.cancel();
    pending.reject(new Error('offline'));
    await opened;
    assert.deepEqual(calls, []);
});

test('deep link (bug): only the newest link is applied when two finish out of order', async () => {
    const { calls, actions } = recorder();
    const first = deferred();
    const second = deferred();
    const queue = [first, second];
    const link = global.window.EncounterRoute.createDeepLink({ loadCards: () => queue.shift().promise, actions });
    const older = link.open('b');
    const newer = link.open('c');
    second.resolve(cards);
    await newer;
    first.resolve(cards);
    await older;
    await flush();
    assert.deepEqual(calls, [['showLocked']]);
});

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

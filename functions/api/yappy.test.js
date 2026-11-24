'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(path.join(__dirname, 'yappy.js')).href;

async function call(bindings) {
    const { onRequestGet } = await import(MODULE_URL);
    return onRequestGet({ env: bindings });
}

test('returns the configured number as JSON', async () => {
    const res = await call({ YAPPY_NUMBER: '+507 6000-0000' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await res.json(), { number: '+507 6000-0000' });
});

test('trims surrounding whitespace from the configured number', async () => {
    const res = await call({ YAPPY_NUMBER: '  60000000\n' });
    assert.deepEqual(await res.json(), { number: '60000000' });
});

test('is never cached or indexed', async () => {
    const res = await call({ YAPPY_NUMBER: '60000000' });
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
});

test('answers 404 when the variable is missing', async () => {
    const res = await call({});
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not-configured' });
});

test('answers 404 when the variable is blank', async () => {
    const res = await call({ YAPPY_NUMBER: '   ' });
    assert.equal(res.status, 404);
});

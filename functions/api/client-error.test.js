'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(path.join(__dirname, 'client-error.js')).href;
const ENDPOINT = 'https://develop4god.com/api/client-error';

async function post(body, { headers = {}, raw } = {}) {
    const { onRequestPost } = await import(MODULE_URL);
    const request = new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'user-agent': 'test-agent', ...headers },
        body: raw !== undefined ? raw : JSON.stringify(body),
    });
    const lines = [];
    const original = console.log;
    console.log = (line) => lines.push(line);
    try {
        const res = await onRequestPost({ request });
        return { res, lines };
    } finally {
        console.log = original;
    }
}

const VALID = { stage: 'checkout', frequency: 'once', quantity: 5, message: 'Window closed' };

test('logs one structured line for a valid report and answers 204', async () => {
    const { res, lines } = await post(VALID);
    assert.equal(res.status, 204);
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.event, 'client_error');
    assert.equal(entry.stage, 'checkout');
    assert.equal(entry.frequency, 'once');
    assert.equal(entry.quantity, 5);
    assert.equal(entry.message, 'Window closed');
    assert.equal(entry.userAgent, 'test-agent');
});

test('frequency and quantity are optional', async () => {
    const { res, lines } = await post({ stage: 'sdk', message: 'sdk' });
    assert.equal(res.status, 204);
    assert.equal(JSON.parse(lines[0]).stage, 'sdk');
});

test('rejects an unknown stage, frequency or a bad quantity with 400 and logs nothing', async () => {
    const bad = [
        { ...VALID, stage: 'hack' },
        { ...VALID, frequency: 'weekly' },
        { ...VALID, quantity: 0 },
        { ...VALID, quantity: 10001 },
        { ...VALID, quantity: 1.5 },
        { ...VALID, quantity: '5' },
        { ...VALID, message: 42 },
        { frequency: 'once' },
        [],
        null,
    ];
    for (const body of bad) {
        const { res, lines } = await post(body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(lines.length, 0);
    }
});

test('rejects malformed JSON and an empty body', async () => {
    for (const raw of ['{nope', '']) {
        const { res, lines } = await post(null, { raw });
        assert.equal(res.status, 400);
        assert.equal(lines.length, 0);
    }
});

test('rejects an oversized body with 413', async () => {
    const { res, lines } = await post({ ...VALID, message: 'x'.repeat(5000) });
    assert.equal(res.status, 413);
    assert.equal(lines.length, 0);
});

test('rejects an oversized body by bytes, not characters, and by Content-Length', async () => {
    const wide = await post({ ...VALID, message: '€'.repeat(800) }); // 800 characters, 2400 bytes
    assert.equal(wide.res.status, 413);
    const { onRequestPost } = await import(MODULE_URL);
    const declared = new Request(ENDPOINT, { method: 'POST', headers: { 'content-length': '999999' }, body: '{}' });
    assert.equal((await onRequestPost({ request: declared })).status, 413);
});

test('answers 405 with Allow: POST for any other method', async () => {
    const { onRequest } = await import(MODULE_URL);
    const res = onRequest({ request: new Request(ENDPOINT, { method: 'GET' }) });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');
});

test('truncates a long message and strips control characters', async () => {
    const { lines } = await post({ ...VALID, message: 'a\nb\u0000' + 'y'.repeat(400) });
    const message = JSON.parse(lines[0]).message;
    assert.ok(message.length <= 300);
    assert.ok([...message].every((character) => character.charCodeAt(0) > 31));
});

test('rejects a cross-site Origin', async () => {
    const { res, lines } = await post(VALID, { headers: { origin: 'https://evil.example' } });
    assert.equal(res.status, 403);
    assert.equal(lines.length, 0);
});

test('accepts the same-site Origin', async () => {
    const { res } = await post(VALID, { headers: { origin: 'https://develop4god.com' } });
    assert.equal(res.status, 204);
});

test('is never cached or indexed', async () => {
    const { res } = await post(VALID);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
});

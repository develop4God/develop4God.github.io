'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the real browser-IIFE source (not a copy) so c8 attributes coverage to error-report.js.
const filename = path.join(__dirname, 'error-report.js');
const source = fs.readFileSync(filename, 'utf8');

class FakeBlob {
    constructor(parts, options) { this.text = parts.join(''); this.type = options.type; }
}
global.Blob = FakeBlob;

function load({ navigator = {}, fetch } = {}) {
    const win = { fetch };
    vm.runInThisContext(`(function(window, navigator){${source}\n})`, { filename })(win, navigator);
    return win.ErrorReport;
}

test('report sends a JSON beacon to /api/client-error', () => {
    const sent = [];
    const { report } = load({ navigator: { sendBeacon: (url, blob) => { sent.push({ url, blob }); return true; } } });
    report('checkout', new Error('Window closed'), { frequency: 'once', quantity: 5 });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, '/api/client-error');
    assert.deepEqual(JSON.parse(sent[0].blob.text), { stage: 'checkout', frequency: 'once', quantity: 5, message: 'Window closed' });
});

test('accepts a string, a plain object, undefined or null as the error', () => {
    const { buildPayload } = load();
    assert.equal(buildPayload('sdk', 'sdk', {}).message, 'sdk');
    assert.equal(buildPayload('render', { message: 'boom' }, {}).message, 'boom');
    assert.equal(buildPayload('render', undefined, {}).message, 'unknown');
    assert.equal(buildPayload('render', null, {}).message, 'unknown');
});

test('cuts a long message to the length the endpoint accepts', () => {
    const { buildPayload } = load();
    assert.equal(buildPayload('subscribe', new Error('x'.repeat(5000)), {}).message.length, 300);
});

test('the same stage and message is reported again for another frequency', () => {
    const sent = [];
    const { report } = load({ navigator: { sendBeacon: (url, blob) => { sent.push(blob); return true; } } });
    report('sdk', 'down', { frequency: 'once' });
    report('sdk', 'down', { frequency: 'monthly' });
    assert.equal(sent.length, 2);
});

test('omits frequency and quantity when not given', () => {
    const { buildPayload } = load();
    assert.deepEqual(buildPayload('sdk', 'x', {}), { stage: 'sdk', message: 'x' });
});

test('falls back to fetch keepalive when sendBeacon refuses', () => {
    const calls = [];
    const fetch = (url, init) => { calls.push({ url, init }); return Promise.resolve(); };
    const { report } = load({ navigator: { sendBeacon: () => false }, fetch });
    report('sdk', 'sdk', {});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.keepalive, true);
});

test('never throws, even if the transport throws, rejects or is missing', async () => {
    const throwing = load({
        navigator: { sendBeacon: () => { throw new Error('nope'); } },
        fetch: () => { throw new Error('nope'); },
    });
    assert.doesNotThrow(() => throwing.report('sdk', 'x', {}));
    const rejecting = load({ fetch: () => Promise.reject(new Error('offline')) });
    assert.doesNotThrow(() => rejecting.report('sdk', 'x', {}));
    await new Promise((resolve) => setImmediate(resolve)); // an unhandled rejection would fail the run
    assert.doesNotThrow(() => load().report('sdk', 'x', {}));
});

test('reports each stage and message once, so a retry loop cannot flood the endpoint', () => {
    const sent = [];
    const { report } = load({ navigator: { sendBeacon: (url, blob) => { sent.push(blob); return true; } } });
    report('checkout', 'same', {});
    report('checkout', 'same', {});
    report('checkout', 'other', {});
    assert.equal(sent.length, 2);
});

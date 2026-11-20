'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'encounter-paypal.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const { createEncounterPaypal } = global.window.EncounterPaypal;

const CONFIG = { enabled: true, clientId: 'sb-client', amount: 4.99, currency: 'USD' };

// Fake DOM: an element records its tag and props; the container records what was appended.
const h = (tag, props = {}) => ({ tag, props, removed: false, remove() { this.removed = true; } });
const container = () => ({ children: [], append(el) { this.children.push(el); } });

function make(overrides = {}) {
    const calls = { loadScript: [], render: [] };
    let sdk = { Buttons: true };
    const deps = {
        h,
        config: CONFIG,
        checkout: {
            buildSdkUrl: ({ clientId, currency }) => `https://sdk.test/?client-id=${clientId}&currency=${currency}`,
            renderButtons: (paypal, el, options) => calls.render.push({ paypal, el, options }),
        },
        loadScript: (url) => { calls.loadScript.push(url); return Promise.resolve(); },
        getSdk: () => sdk,
        ...overrides,
    };
    return { paypal: createEncounterPaypal(deps), calls, setSdk: (v) => { sdk = v; } };
}

// What PayPal's capture response looks like: the order status plus the captures under purchase_units.
const paid = (id = 'CAP1', captureStatus = 'COMPLETED') => ({
    status: 'COMPLETED',
    id,
    purchase_units: [{ payments: { captures: [{ id, status: captureStatus }] } }],
});

// Flush pending promise callbacks (the SDK load is a promise chain).
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('disabled config: nothing is loaded and no slot is added (F2)', async () => {
    const { paypal, calls } = make({ config: { ...CONFIG, enabled: false } });
    const box = container();
    assert.equal(paypal.mount(box), false);
    await flush();
    assert.equal(calls.loadScript.length, 0);
    assert.equal(box.children.length, 0);
});

test('a blank client id is treated as disabled, so nothing loads', async () => {
    const { paypal, calls } = make({ config: { ...CONFIG, clientId: '   ' } });
    assert.equal(paypal.mount(container()), false);
    await flush();
    assert.equal(calls.loadScript.length, 0);
});

test('constructing the module never loads the SDK: only a mount does (F2)', async () => {
    const { calls } = make();
    await flush();
    assert.equal(calls.loadScript.length, 0);
});

test('mount loads the SDK URL built from config and renders buttons at the fixed price (F2)', async () => {
    const { paypal, calls } = make();
    assert.equal(paypal.mount(container()), true);
    await flush();
    assert.deepEqual(calls.loadScript, ['https://sdk.test/?client-id=sb-client&currency=USD']);
    assert.equal(calls.render.length, 1);
    assert.equal(calls.render[0].options.amount, 4.99);
    assert.equal(calls.render[0].options.currency, 'USD');
});

test('the "this browser only" note is shown above the button when payments are on (F5)', async () => {
    const { paypal } = make({ note: 'Unlocks this browser only.' });
    const box = container();
    paypal.mount(box);
    assert.equal(box.children[0].tag, 'p');
    assert.equal(box.children[0].props.text, 'Unlocks this browser only.');
    assert.equal(box.children[1].tag, 'div');
    await flush();
});

test('the SDK is loaded once across several mounts', async () => {
    const { paypal, calls } = make();
    paypal.mount(container());
    paypal.mount(container());
    await flush();
    assert.equal(calls.loadScript.length, 1);
    assert.equal(calls.render.length, 2);
});

test('a COMPLETED capture grants exactly once, even if PayPal approves again (F3)', async () => {
    const { paypal, calls } = make();
    const granted = [];
    paypal.mount(container(), { onGranted: (d) => granted.push(d) });
    await flush();
    const { onApproved } = calls.render[0].options;
    onApproved(paid('CAP1'));
    onApproved(paid('CAP2'));
    assert.deepEqual(granted, [paid('CAP1')]);
});

test('a non-COMPLETED capture does not grant, reports failure, and a later completed one still can (F3)', async () => {
    const { paypal, calls } = make();
    const granted = [];
    let failed = 0;
    paypal.mount(container(), { onGranted: (d) => granted.push(d), onFailed: () => { failed += 1; } });
    await flush();
    const { onApproved } = calls.render[0].options;
    onApproved({ status: 'PENDING' });
    onApproved(undefined);
    assert.equal(failed, 2);
    assert.equal(granted.length, 0);
    onApproved(paid());
    assert.equal(granted.length, 1);
});

test('a PayPal error reports failure and grants nothing (F3)', async () => {
    const { paypal, calls } = make();
    const granted = [];
    let failed = 0;
    paypal.mount(container(), { onGranted: () => granted.push(1), onFailed: () => { failed += 1; } });
    await flush();
    calls.render[0].options.onError(new Error('declined'));
    assert.equal(failed, 1);
    assert.equal(granted.length, 0);
});

test('an error after a granted capture is ignored, so the payer is not told it failed', async () => {
    const { paypal, calls } = make();
    let failed = 0;
    paypal.mount(container(), { onGranted: () => {}, onFailed: () => { failed += 1; } });
    await flush();
    const { onApproved, onError } = calls.render[0].options;
    onApproved(paid());
    onError(new Error('late'));
    assert.equal(failed, 0);
});

test('an SDK that fails to load renders no button, and the next mount retries the load (F2)', async () => {
    let attempts = 0;
    const { paypal, calls } = make({
        loadScript: () => { attempts += 1; return attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(); },
    });
    const first = container();
    paypal.mount(first);
    await flush();
    assert.equal(first.children.length, 1);
    assert.equal(first.children[0].removed, true, 'the empty slot is removed');
    assert.equal(calls.render.length, 0);

    paypal.mount(container());
    await flush();
    assert.equal(attempts, 2);
    assert.equal(calls.render.length, 1);
});

test('a missing SDK global removes the slot instead of throwing', async () => {
    const { paypal, calls } = make({ getSdk: () => undefined, checkout: { buildSdkUrl: () => 'u', renderButtons: () => { throw new Error('no paypal'); } } });
    const box = container();
    paypal.mount(box);
    await flush();
    assert.equal(box.children[0].removed, true);
    assert.equal(calls.render.length, 0);
});

test('isEnabled reports the same switch that mount uses', () => {
    assert.equal(make().paypal.isEnabled(), true);
    assert.equal(make({ config: { ...CONFIG, enabled: false } }).paypal.isEnabled(), false);
    assert.equal(make({ config: { ...CONFIG, clientId: '' } }).paypal.isEnabled(), false);
});

test('supportLabel puts the price in the reader language, formatted as currency', () => {
    const { paypal } = make();
    assert.equal(paypal.supportLabel('Support and open all · {price}', 'en-US'), 'Support and open all · $4.99');
    assert.match(paypal.supportLabel('Apoyar y abrir todos · {price}', 'es'), /^Apoyar y abrir todos · 4,99\s*US\$$/);
});

test('supportLabel falls back to English when the locale is malformed (red: it threw a RangeError)', () => {
    assert.equal(make().paypal.supportLabel('Support · {price}', 'not_a_locale!!'), 'Support · $4.99');
});

test('supportLabel keeps a template without a placeholder unchanged', () => {
    assert.equal(make().paypal.supportLabel('No price here', 'en'), 'No price here');
});

test('when the SDK cannot load, onUnavailable is called so the sheet can offer its fallback (F2)', async () => {
    const { paypal } = make({ loadScript: () => Promise.reject(new Error('offline')) });
    let unavailable = 0;
    paypal.mount(container(), { onUnavailable: () => { unavailable += 1; } });
    await flush();
    assert.equal(unavailable, 1);
});

test('a rejected render shows the Play fallback and removes the slot and note (no unhandled rejection)', async () => {
    const calls = { onUnavailable: 0, onFailed: 0 };
    const deps = {
        h,
        config: CONFIG,
        note: 'Only this browser.',
        checkout: {
            buildSdkUrl: () => 'https://sdk.test/',
            renderButtons: () => Promise.reject(new Error('container detached')),
        },
        loadScript: () => Promise.resolve(),
        getSdk: () => ({}),
    };
    const paypal = createEncounterPaypal(deps);
    const box = container();
    paypal.mount(box, { onUnavailable: () => { calls.onUnavailable += 1; } });
    await flush();
    await flush();
    assert.equal(calls.onUnavailable, 1);
    assert.equal(box.children.length, 2, 'note and slot were appended');
    assert.ok(box.children.every((el) => el.removed), 'both the note and the slot are removed');
});

test('an order COMPLETED whose capture is still PENDING does not grant and reports failure (review F-capture)', async () => {
    const { paypal, calls } = make();
    const granted = [];
    let failed = 0;
    paypal.mount(container(), { onGranted: (d) => granted.push(d), onFailed: () => { failed += 1; } });
    await flush();
    calls.render[0].options.onApproved(paid('CAP1', 'PENDING'));
    assert.equal(granted.length, 0);
    assert.equal(failed, 1);
});

test('an order COMPLETED with no capture record does not grant', async () => {
    const { paypal, calls } = make();
    const granted = [];
    paypal.mount(container(), { onGranted: (d) => granted.push(d), onFailed: () => {} });
    await flush();
    calls.render[0].options.onApproved({ status: 'COMPLETED', purchase_units: [{}] });
    assert.equal(granted.length, 0);
});

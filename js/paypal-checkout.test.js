'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the real browser-IIFE source (not a copy) so c8 attributes coverage to paypal-checkout.js.
const filename = path.join(__dirname, 'paypal-checkout.js');
const source = fs.readFileSync(filename, 'utf8');
global.window = {};
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { buildSdkUrl, buildOrder, renderButtons } = global.window.PayPalCheckout;

test('buildSdkUrl points at the PayPal SDK with client id, currency, capture intent and buttons', () => {
  const url = new URL(buildSdkUrl({ clientId: 'test-client', currency: 'USD' }));
  assert.equal(url.origin + url.pathname, 'https://www.paypal.com/sdk/js');
  assert.equal(url.searchParams.get('client-id'), 'test-client');
  assert.equal(url.searchParams.get('currency'), 'USD');
  assert.equal(url.searchParams.get('intent'), 'capture');
  assert.equal(url.searchParams.get('components'), 'buttons');
});

test('buildSdkUrl encodes the client id so it round-trips unchanged', () => {
  const url = new URL(buildSdkUrl({ clientId: 'a b&c=d', currency: 'USD' }));
  assert.equal(url.searchParams.get('client-id'), 'a b&c=d');
});

test('buildSdkUrl rejects a missing or blank client id', () => {
  assert.throws(() => buildSdkUrl({ currency: 'USD' }), /clientId/);
  assert.throws(() => buildSdkUrl({ clientId: '   ', currency: 'USD' }), /clientId/);
});

test('buildSdkUrl rejects a currency that is not three uppercase letters', () => {
  assert.throws(() => buildSdkUrl({ clientId: 'x', currency: 'usd' }), /currency/);
  assert.throws(() => buildSdkUrl({ clientId: 'x', currency: 'US' }), /currency/);
  assert.throws(() => buildSdkUrl({ clientId: 'x' }), /currency/);
});

test('buildOrder formats the amount with two decimals as PayPal expects', () => {
  const order = buildOrder({ amount: 5, currency: 'USD' });
  assert.deepEqual(order.purchase_units[0].amount, { currency_code: 'USD', value: '5.00' });
});

test('buildOrder accepts a valid cent amount that floating point multiplication makes inexact', () => {
  assert.equal(buildOrder({ amount: 0.07, currency: 'USD' }).purchase_units[0].amount.value, '0.07');
});

test('buildOrder keeps the description when given', () => {
  const order = buildOrder({ amount: 2.5, currency: 'USD', description: 'Support' });
  assert.equal(order.purchase_units[0].description, 'Support');
  assert.equal(order.purchase_units[0].amount.value, '2.50');
});

test('buildOrder rejects amounts that are zero, negative, not finite, or have more than two decimals', () => {
  for (const amount of [0, -1, NaN, Infinity, 1.005, '5']) {
    assert.throws(() => buildOrder({ amount, currency: 'USD' }), /amount/, `amount ${amount}`);
  }
});

test('buildOrder rejects a description longer than PayPal accepts', () => {
  assert.throws(() => buildOrder({ amount: 1, currency: 'USD', description: 'x'.repeat(128) }), /description/);
});

test('buildOrder rejects an invalid currency', () => {
  assert.throws(() => buildOrder({ amount: 1, currency: 'usd' }), /currency/);
});

// A fake of the PayPal JS SDK: records the options handed to paypal.Buttons and the render call.
function fakePaypal() {
  const calls = { options: null, rendered: null, created: null, captured: null };
  const paypal = {
    Buttons(options) {
      calls.options = options;
      return {
        render(container) {
          calls.rendered = container;
          return Promise.resolve();
        },
      };
    },
  };
  return { paypal, calls };
}

test('renderButtons creates an order with the amount and currency, then renders into the container', async () => {
  const { paypal, calls } = fakePaypal();
  const actions = { order: { create: (payload) => { calls.created = payload; return Promise.resolve('ORDER-1'); } } };
  renderButtons(paypal, 'CONTAINER', { amount: 3, currency: 'USD', description: 'Ministry', onApproved() {} });

  assert.equal(calls.rendered, 'CONTAINER');
  const orderId = await calls.options.createOrder(null, actions);
  assert.equal(orderId, 'ORDER-1');
  assert.equal(calls.created.purchase_units[0].amount.value, '3.00');
  assert.equal(calls.created.purchase_units[0].description, 'Ministry');
});

test('renderButtons passes the captured order details to onApproved', async () => {
  const { paypal, calls } = fakePaypal();
  const details = { id: 'ORDER-1', status: 'COMPLETED' };
  let approved = null;
  renderButtons(paypal, 'CONTAINER', { amount: 1, currency: 'USD', onApproved: (d) => { approved = d; } });

  await calls.options.onApprove(null, { order: { capture: () => Promise.resolve(details) } });
  assert.deepEqual(approved, details);
});

test('renderButtons reports a failed capture through onError instead of throwing', async () => {
  const { paypal, calls } = fakePaypal();
  let reported = null;
  renderButtons(paypal, 'CONTAINER', { amount: 1, currency: 'USD', onApproved() {}, onError: (e) => { reported = e; } });

  const failure = new Error('capture failed');
  await calls.options.onApprove(null, { order: { capture: () => Promise.reject(failure) } });
  assert.equal(reported, failure);
});

test('renderButtons does not report a failed capture when onApproved itself throws', async () => {
  const { paypal, calls } = fakePaypal();
  let reported = null;
  renderButtons(paypal, 'CONTAINER', {
    amount: 1,
    currency: 'USD',
    onApproved() { throw new Error('UI bug after payment'); },
    onError: (e) => { reported = e; },
  });

  const originalError = console.error;
  console.error = () => {};
  try {
    await calls.options.onApprove(null, { order: { capture: () => Promise.resolve({ status: 'COMPLETED' }) } });
  } finally {
    console.error = originalError;
  }
  assert.equal(reported, null);
});

test('renderButtons refuses to render an invalid amount before PayPal is called', () => {
  const { paypal, calls } = fakePaypal();
  assert.throws(() => renderButtons(paypal, 'CONTAINER', { amount: -1, currency: 'USD', onApproved() {} }), /amount/);
  assert.equal(calls.options, null);
});

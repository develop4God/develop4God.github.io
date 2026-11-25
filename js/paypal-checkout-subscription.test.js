'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the real browser-IIFE source so these tests cover the subscription helpers in paypal-checkout.js.
const filename = path.join(__dirname, 'paypal-checkout.js');
const source = fs.readFileSync(filename, 'utf8');
global.window = {};
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { buildSdkUrl, renderSubscriptionButton, parseQuantity } = global.window.PayPalCheckout;

test('buildSdkUrl keeps the one-time capture intent by default', () => {
  const url = new URL(buildSdkUrl({ clientId: 'abc', currency: 'USD' }));
  assert.equal(url.searchParams.get('intent'), 'capture');
  assert.equal(url.searchParams.has('vault'), false);
});

test('buildSdkUrl asks for subscriptions with vaulting when the intent is subscription', () => {
  const url = new URL(buildSdkUrl({ clientId: 'abc', currency: 'USD', intent: 'subscription' }));
  assert.equal(url.searchParams.get('intent'), 'subscription');
  assert.equal(url.searchParams.get('vault'), 'true');
});

test('buildSdkUrl rejects an unknown intent', () => {
  assert.throws(() => buildSdkUrl({ clientId: 'abc', currency: 'USD', intent: 'authorize' }), /intent/);
});

test('renderSubscriptionButton renders a subscribe button for the plan id', () => {
  let options = null;
  let rendered = null;
  const fakePaypal = {
    Buttons(opts) {
      options = opts;
      return { render(container) { rendered = container; return Promise.resolve(); } };
    },
  };
  renderSubscriptionButton(fakePaypal, 'container-el', { planId: 'P-123', quantity: 25 });
  assert.equal(rendered, 'container-el');
  assert.deepEqual(options.createSubscription(null, { subscription: { create: (body) => body } }), { plan_id: 'P-123', quantity: '25' });
});

test('renderSubscriptionButton uses the round blue PayPal button style', () => {
  let options = null;
  const fakePaypal = { Buttons(opts) { options = opts; return { render() { return Promise.resolve(); } }; } };
  renderSubscriptionButton(fakePaypal, 'c', { planId: 'P-123', quantity: 5 });
  assert.deepEqual(options.style, { shape: 'pill', color: 'blue', layout: 'vertical', label: 'subscribe', height: 48 });
});

test('renderSubscriptionButton reports an approved subscription id to onApproved', () => {
  let options = null;
  const fakePaypal = { Buttons(opts) { options = opts; return { render() { return Promise.resolve(); } }; } };
  const approved = [];
  renderSubscriptionButton(fakePaypal, 'c', { planId: 'P-123', quantity: 5, onApproved: (id) => approved.push(id) });
  options.onApprove({ subscriptionID: 'I-SUB1' });
  assert.deepEqual(approved, ['I-SUB1']);
});

test('renderSubscriptionButton refuses a missing plan id', () => {
  assert.throws(() => renderSubscriptionButton({ Buttons() {} }, 'c', { planId: '' }), /planId/);
});

test('a throwing onApproved after an approved subscription is not reported as a failed subscription', () => {
  let options = null;
  const fakePaypal = { Buttons(opts) { options = opts; return { render() { return Promise.resolve(); } }; } };
  const errors = [];
  renderSubscriptionButton(fakePaypal, 'c', {
    planId: 'P-123',
    quantity: 5,
    onApproved: () => { throw new Error('ui broke'); },
    onError: (error) => errors.push(error),
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => options.onApprove({ subscriptionID: 'I-SUB1' }));
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(errors, []);
});

test('renderSubscriptionButton sends the donor amount as the plan quantity, as a string', () => {
  let options = null;
  const fakePaypal = { Buttons(opts) { options = opts; return { render() { return Promise.resolve(); } }; } };
  renderSubscriptionButton(fakePaypal, 'c', { planId: 'P-123', quantity: 1000 });
  assert.equal(options.createSubscription(null, { subscription: { create: (body) => body } }).quantity, '1000');
});

test('renderSubscriptionButton refuses a missing, zero, fractional or non-numeric quantity', () => {
  for (const quantity of [undefined, 0, -5, 2.5, '5', NaN, Infinity]) {
    assert.throws(() => renderSubscriptionButton({ Buttons() {} }, 'c', { planId: 'P-123', quantity }), /quantity/, String(quantity));
  }
});

test('parseQuantity accepts whole numbers at or above the minimum', () => {
  assert.equal(parseQuantity('5', 5), 5);
  assert.equal(parseQuantity(' 42 ', 5), 42);
  assert.equal(parseQuantity('10000', 5), 10000);
});

test('parseQuantity rejects amounts below the minimum, decimals, junk and empty input', () => {
  for (const raw of ['4', '0', '-5', '5.5', '5.0', '1e3', 'abc', '', '  ', undefined, null, '05x']) {
    assert.equal(parseQuantity(raw, 5), null, String(raw));
  }
});

test('parseQuantity rejects an amount above the maximum and accepts the maximum itself', () => {
  assert.equal(parseQuantity('10000', 5, 10000), 10000);
  assert.equal(parseQuantity('10001', 5, 10000), null);
  assert.equal(parseQuantity('99999999', 5, 10000), null);
});

test('one-time buttons keep PayPal\'s default look unless a style is requested (Encounters shares this function)', () => {
  let options = null;
  const fakePaypal = { Buttons(opts) { options = opts; return { render() { return Promise.resolve(); } }; } };
  global.window.PayPalCheckout.renderButtons(fakePaypal, 'c', { amount: 10, currency: 'USD' });
  assert.equal('style' in options, false);
});

test('one-time buttons take the requested style, e.g. the shared pill look', () => {
  let options = null;
  const fakePaypal = { Buttons(opts) { options = opts; return { render() { return Promise.resolve(); } }; } };
  const style = { ...global.window.PayPalCheckout.PILL_LOOK, color: 'gold' };
  global.window.PayPalCheckout.renderButtons(fakePaypal, 'c', { amount: 10, currency: 'USD', style });
  assert.deepEqual(options.style, { shape: 'pill', layout: 'vertical', height: 48, color: 'gold' });
});

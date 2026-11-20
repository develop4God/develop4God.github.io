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
const { buildSdkUrl, renderSubscriptionButton, SUBSCRIPTION_PLANS } = global.window.PayPalCheckout;

test('SUBSCRIPTION_PLANS lists monthly and yearly plans at 5, 10 and 25 USD with unique ids', () => {
  assert.equal(SUBSCRIPTION_PLANS.length, 6);
  assert.deepEqual(
    SUBSCRIPTION_PLANS.map((p) => `${p.frequency}-${p.amount}`).sort(),
    ['monthly-10', 'monthly-25', 'monthly-5', 'yearly-10', 'yearly-25', 'yearly-5'],
  );
  assert.equal(new Set(SUBSCRIPTION_PLANS.map((p) => p.planId)).size, 6);
  assert.ok(Object.isFrozen(SUBSCRIPTION_PLANS));
});

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
  renderSubscriptionButton(fakePaypal, 'container-el', { planId: 'P-123' });
  assert.equal(rendered, 'container-el');
  assert.deepEqual(options.createSubscription(null, { subscription: { create: (body) => body } }), { plan_id: 'P-123' });
});

test('renderSubscriptionButton uses the round blue PayPal button style', () => {
  let options = null;
  const fakePaypal = { Buttons(opts) { options = opts; return { render() { return Promise.resolve(); } }; } };
  renderSubscriptionButton(fakePaypal, 'c', { planId: 'P-123' });
  assert.deepEqual(options.style, { shape: 'pill', color: 'blue', layout: 'vertical', label: 'subscribe' });
});

test('renderSubscriptionButton reports an approved subscription id to onApproved', () => {
  let options = null;
  const fakePaypal = { Buttons(opts) { options = opts; return { render() { return Promise.resolve(); } }; } };
  const approved = [];
  renderSubscriptionButton(fakePaypal, 'c', { planId: 'P-123', onApproved: (id) => approved.push(id) });
  options.onApprove({ subscriptionID: 'I-SUB1' });
  assert.deepEqual(approved, ['I-SUB1']);
});

test('renderSubscriptionButton refuses a missing plan id', () => {
  assert.throws(() => renderSubscriptionButton({ Buttons() {} }, 'c', { planId: '' }), /planId/);
});

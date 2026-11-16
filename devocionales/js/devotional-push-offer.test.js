const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadInto(win, file) {
    const filename = path.join(__dirname, file);
    const source = fs.readFileSync(filename, 'utf8');
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
}

const globals = {};
loadInto(globals, 'devotional-push-offer.js');
const { create } = globals.DevotionalPushOffer;

function fakeEl() {
    const classes = new Set(['hidden']);
    const listeners = {};
    return {
        listeners,
        classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n), contains: (n) => classes.has(n) },
        addEventListener: (type, handler) => { listeners[type] = handler; },
        get shown() { return !classes.has('hidden'); },
    };
}

function fakeDoc() {
    const els = { '[data-push-offer]': fakeEl(), '[data-push-offer-enable]': fakeEl(), '[data-push-offer-later]': fakeEl() };
    return { els, querySelector: (s) => els[s] || null };
}

// Like the facade's guarded storage: with `forgets` a write is silently lost (private mode).
function fakeStorage(initial = {}, { forgets = false } = {}) {
    const data = { ...initial };
    return {
        data,
        get: (k) => (k in data ? data[k] : null),
        set: (k, v) => { if (!forgets) data[k] = String(v); },
    };
}

function setup({ eligible = true, storage = fakeStorage(), doc = fakeDoc() } = {}) {
    const calls = { enable: 0 };
    const state = { eligible };
    const offer = create(doc, { storage, isEligible: () => state.eligible, onEnable: () => { calls.enable += 1; } });
    return { doc, storage, state, calls, offer, card: doc.els['[data-push-offer]'] };
}

test('shows when eligible and not dismissed; stays hidden until update() is called', () => {
    const ctx = setup();
    assert.equal(ctx.card.shown, false);
    ctx.offer.update();
    assert.equal(ctx.card.shown, true);
});

test('hides again when the reader is no longer eligible (opted in, permission changed)', () => {
    const ctx = setup();
    ctx.offer.update();
    ctx.state.eligible = false;
    ctx.offer.update();
    assert.equal(ctx.card.shown, false);
});

test('a stored dismissal keeps it hidden', () => {
    const ctx = setup({ storage: fakeStorage({ 'devotionalPush.offerDismissed': '1' }) });
    ctx.offer.update();
    assert.equal(ctx.card.shown, false);
});

test('Not now hides the card and remembers it; later pages never show it', () => {
    const ctx = setup();
    ctx.offer.update();
    ctx.doc.els['[data-push-offer-later]'].listeners.click();
    assert.equal(ctx.card.shown, false);
    assert.equal(ctx.storage.data['devotionalPush.offerDismissed'], '1');
    const later = setup({ storage: ctx.storage });
    later.offer.update();
    assert.equal(later.card.shown, false);
});

test('Not now where nothing can be stored still hides for this page view', () => {
    const ctx = setup({ storage: fakeStorage({}, { forgets: true }) });
    ctx.offer.update();
    assert.equal(ctx.card.shown, true);
    assert.doesNotThrow(() => ctx.doc.els['[data-push-offer-later]'].listeners.click());
    assert.equal(ctx.card.shown, false);
    ctx.offer.update();
    assert.equal(ctx.card.shown, false);
});

test('Enable runs the callback once and hides the card; update() decides afterwards whether it returns', () => {
    const ctx = setup();
    ctx.offer.update();
    ctx.doc.els['[data-push-offer-enable]'].listeners.click();
    assert.equal(ctx.calls.enable, 1);
    assert.equal(ctx.card.shown, false);
    assert.equal(ctx.storage.data['devotionalPush.offerDismissed'], undefined);
    ctx.offer.update();
    assert.equal(ctx.card.shown, true);
    ctx.state.eligible = false;
    ctx.offer.update();
    assert.equal(ctx.card.shown, false);
});

test('old html without the card: create and update do not throw', () => {
    const doc = { querySelector: () => null };
    const offer = create(doc, { storage: fakeStorage(), isEligible: () => true, onEnable() {} });
    assert.doesNotThrow(() => offer.update());
});

test('a throwing eligibility check hides the card instead of throwing', () => {
    const doc = fakeDoc();
    const offer = create(doc, { storage: fakeStorage(), isEligible: () => { throw new Error('boom'); }, onEnable() {} });
    assert.doesNotThrow(() => offer.update());
    assert.equal(doc.els['[data-push-offer]'].shown, false);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
function load(name) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
load('dom-builder.js');
load('discovery-card-dom.js');
const { createBuilder } = global.window.DomBuilder;
const { createCardDom } = global.window.DiscoveryCardDom;

const LABELS = {
    eyebrow: 'Daily Bible study', minutes: 'min', badgeNew: 'New', badgeCompleted: 'Completed', badgeCurrent: 'Current',
    favorite: 'Favorite', share: 'Share', removeConfirm: 'Remove it?', removeYes: 'Yes', cancel: 'Cancel',
    continueBtn: 'Continue', read: 'Read', continueWhereLeft: 'Continue where you left off', startHere: 'Start here',
};
const t = (key) => LABELS[key] || key;
const doc = new FakeDocument();
const dom = createCardDom({ h: createBuilder(doc), t });
const noop = () => {};
const handlers = (over = {}) => ({ onOpen: noop, onToggleFavorite: noop, onShare: noop, onConfirmRemove: noop, onCancelRemove: noop, ...over });
const card = (over = {}) => ({
    id: 'love', title: 'Love That Kneels', subtitle: 'What Jesus did', emoji: '🧎', minutes: 9,
    badge: null, isFavorite: false, isCompleted: false, isInProgress: false, percent: null, ...over,
});

test('card: shows emoji, title, subtitle and "eyebrow · N min"', () => {
    const el = dom.buildCard(card(), { handlers: handlers() });
    assert.equal(el.getAttribute('data-study-id'), 'love');
    assert.equal(el.querySelector('.study-card-title').textContent, 'Love That Kneels');
    assert.equal(el.querySelector('.study-card-subtitle').textContent, 'What Jesus did');
    assert.equal(el.querySelector('.study-card-emoji').textContent, '🧎');
    assert.equal(el.querySelector('.study-card-meta').textContent, 'Daily Bible study · 9 min');
});

test('card: B7 renders exactly one badge by priority and none when badge is null', () => {
    for (const [badge, text] of [['completed', 'Completed'], ['new', 'New'], ['inProgress', 'Current']]) {
        const el = dom.buildCard(card({ badge }), { handlers: handlers() });
        const badges = el.querySelectorAll('.study-badge');
        assert.equal(badges.length, 1);
        assert.equal(badges[0].textContent, text);
    }
    assert.equal(dom.buildCard(card(), { handlers: handlers() }).querySelectorAll('.study-badge').length, 0);
});

test('card: B6 tapping the card opens the study with its id', () => {
    let opened;
    const el = dom.buildCard(card(), { handlers: handlers({ onOpen: (id) => { opened = id; } }) });
    el.querySelector('.study-card-open').click();
    assert.equal(opened, 'love');
});

test('card: B6 the star and share buttons never open the study', () => {
    let opened = 0, fav = 0, shared = 0;
    const el = dom.buildCard(card(), { handlers: handlers({
        onOpen: () => { opened += 1; }, onToggleFavorite: () => { fav += 1; }, onShare: () => { shared += 1; },
    }) });
    el.querySelector('.study-fav').click();
    el.querySelector('.study-share').click();
    assert.equal(opened, 0, 'clicks bubbling through the article must not open it');
    assert.equal(fav, 1);
    assert.equal(shared, 1);
});

test('card: the favourite button exposes its state with aria-pressed and a label', () => {
    const off = dom.buildCard(card(), { handlers: handlers() }).querySelector('.study-fav');
    const on = dom.buildCard(card({ isFavorite: true }), { handlers: handlers() }).querySelector('.study-fav');
    assert.equal(off.getAttribute('aria-pressed'), 'false');
    assert.equal(on.getAttribute('aria-pressed'), 'true');
    assert.equal(on.getAttribute('aria-label'), 'Favorite: Love That Kneels');
});

test('card: the share button has an accessible name with the study title', () => {
    const el = dom.buildCard(card(), { handlers: handlers() });
    assert.equal(el.querySelector('.study-share').getAttribute('aria-label'), 'Share: Love That Kneels');
});

test('card: the open button has a screen-reader label with title, subtitle, duration and badge', () => {
    const el = dom.buildCard(card({ badge: 'new' }), { handlers: handlers() });
    const label = el.querySelector('.study-card-open').getAttribute('aria-label');
    for (const part of ['Love That Kneels', 'What Jesus did', '9 min', 'New']) assert.ok(label.includes(part), part);
});

test('card: B9 confirming shows an inline confirm strip with Yes / Cancel wired up', () => {
    const calls = [];
    const el = dom.buildCard(card({ isFavorite: true }), { confirming: true, handlers: handlers({
        onConfirmRemove: (id) => calls.push(['yes', id]), onCancelRemove: (id) => calls.push(['no', id]),
    }) });
    const strip = el.querySelector('.study-confirm');
    assert.ok(strip);
    assert.equal(strip.querySelector('p').textContent, 'Remove it?');
    strip.querySelector('.study-confirm-yes').click();
    strip.querySelector('.study-confirm-no').click();
    assert.deepEqual(calls, [['yes', 'love'], ['no', 'love']]);
    assert.equal(dom.buildCard(card(), { handlers: handlers() }).querySelector('.study-confirm'), null);
});

test('card: E0 remote strings are rendered as text, never as HTML', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const el = dom.buildCard(card({ title: payload, subtitle: payload, emoji: payload, id: payload }), { handlers: handlers() });
    assert.equal(el.querySelector('.study-card-title').textContent, payload);
    assert.equal(el.querySelectorAll('img').length, 0);
});

test('card: a missing subtitle renders no empty paragraph', () => {
    assert.equal(dom.buildCard(card({ subtitle: '' }), { handlers: handlers() }).querySelector('.study-card-subtitle'), null);
});

test('card: completed studies show a full progress bar; unknown progress shows none (B3)', () => {
    const done = dom.buildCard(card({ isCompleted: true, percent: 1, badge: 'completed' }), { handlers: handlers() });
    assert.equal(done.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '100');
    assert.equal(dom.buildCard(card(), { handlers: handlers() }).querySelector('[role="progressbar"]'), null);
});

// ---- hero (B2, B3) ----

test('hero: continue kind uses the "continue where you left off" label, Continue button and progress', () => {
    const el = dom.buildHero({ kind: 'continue', card: card({ isInProgress: true, percent: 0.5 }) }, { onOpen: noop });
    assert.equal(el.querySelector('.study-hero-label').textContent, 'Continue where you left off');
    assert.equal(el.querySelector('.study-hero-button').textContent, 'Continue');
    const bar = el.querySelector('[role="progressbar"]');
    assert.equal(bar.getAttribute('aria-valuenow'), '50');
    assert.equal(el.querySelector('.study-hero-percent').textContent, '50%');
});

test('hero: B3 start kind uses "Start here" / Read and shows no progress at all', () => {
    const el = dom.buildHero({ kind: 'start', card: card() }, { onOpen: noop });
    assert.equal(el.querySelector('.study-hero-label').textContent, 'Start here');
    assert.equal(el.querySelector('.study-hero-button').textContent, 'Read');
    assert.equal(el.querySelector('[role="progressbar"]'), null);
    assert.equal(el.querySelector('.study-hero-percent'), null);
});

test('hero: continue without a known total also hides the bar', () => {
    const el = dom.buildHero({ kind: 'continue', card: card({ isInProgress: true, percent: null }) }, { onOpen: noop });
    assert.equal(el.querySelector('[role="progressbar"]'), null);
});

test('hero: the button opens that study', () => {
    let opened;
    const el = dom.buildHero({ kind: 'start', card: card() }, { onOpen: (id) => { opened = id; } });
    el.querySelector('.study-hero-button').click();
    assert.equal(opened, 'love');
});

test('hero: the visible label is the only name (no duplicate aria-label that screen readers would read twice)', () => {
    const el = dom.buildHero({ kind: 'start', card: card() }, { onOpen: noop });
    assert.equal(el.hasAttribute('aria-label'), false);
    assert.ok(el.querySelector('.study-hero-label').textContent.length > 0);
});

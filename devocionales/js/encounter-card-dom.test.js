'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'discovery-list-dom.js', 'encounter-card-dom.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createBuilder } = global.window.DomBuilder;
const { createCardDom } = global.window.EncounterCardDom;

const TEXT = {
    badge_completed: 'Completed', current: 'Current', coming_soon: 'COMING SOON', locked: 'Locked',
    complete_to_unlock: 'Complete to access: {title}', min_immersive_journey: 'MIN IMMERSIVE JOURNEY',
};
const t = (k) => TEXT[k] || k;
const doc = new FakeDocument();
const imageUrlFor = (card, format) => `https://cdn.test/${card.id}/${card.introImage}.${format}`;
const dom = createCardDom({ h: createBuilder(doc), t, imageUrlFor });
const noop = () => {};
const handlers = (over = {}) => ({ onOpen: noop, onLocked: noop, ...over });
const card = (over = {}) => ({
    id: 'peter', title: 'Peter', subtitle: 'Faith', scripture: 'Matthew 14:22-33', minutes: 5, emoji: '🌊',
    accent: '#1e3a5f', introImage: 'peter_intro', state: 'open', badge: null, isNextLocked: false, prerequisiteTitle: null,
    releaseDate: '', ...over,
});

test('open card: title, subtitle, scripture and minutes; one button opens it', () => {
    let opened = null;
    const el = dom.buildCard(card(), { handlers: handlers({ onOpen: (id) => { opened = id; } }) });
    assert.equal(el.getAttribute('data-encounter-id'), 'peter');
    assert.equal(el.querySelector('.study-card-title').textContent, 'Peter');
    assert.equal(el.querySelector('.study-card-subtitle').textContent, 'Faith');
    assert.match(el.querySelector('.study-card-meta').textContent, /Matthew 14:22-33 · 5 MIN IMMERSIVE JOURNEY/);
    el.querySelector('.study-card-open').click();
    assert.equal(opened, 'peter');
    assert.equal(el.querySelectorAll('.encounter-badge').length, 0);
});

test('B9 badges: Current on the next open card, Completed on finished ones', () => {
    assert.equal(dom.buildCard(card({ badge: 'next' }), { handlers: handlers() }).querySelector('.encounter-badge').textContent, 'Current');
    const done = dom.buildCard(card({ state: 'completed', badge: 'completed' }), { handlers: handlers() });
    assert.equal(done.querySelector('.encounter-badge').textContent, 'Completed');
    assert.ok(done.classList.contains('encounter-card--completed'));
});

test('B3 locked card: dimmed, names the prerequisite, announces it, and tapping asks to unlock (not open)', () => {
    let opened = 0; let locked = null;
    const el = dom.buildCard(card({ state: 'locked', prerequisiteTitle: 'Bartimaeus' }), {
        handlers: handlers({ onOpen: () => { opened += 1; }, onLocked: (id) => { locked = id; } }),
    });
    assert.ok(el.classList.contains('encounter-card--locked'));
    assert.equal(el.querySelector('.encounter-card-hint').textContent, 'Complete to access: Bartimaeus');
    const button = el.querySelector('.study-card-open');
    assert.match(button.getAttribute('aria-label'), /Locked/);
    assert.match(button.getAttribute('aria-label'), /Complete to access: Bartimaeus/);
    button.click();
    assert.equal(opened, 0);
    assert.equal(locked, 'peter');
});

test('B4 only the next locked card is highlighted', () => {
    assert.ok(dom.buildCard(card({ state: 'locked', isNextLocked: true, prerequisiteTitle: 'A' }), { handlers: handlers() }).classList.contains('encounter-card--next-locked'));
    assert.ok(!dom.buildCard(card({ state: 'locked', prerequisiteTitle: 'A' }), { handlers: handlers() }).classList.contains('encounter-card--next-locked'));
});

test('locked card without a known prerequisite title still renders safely', () => {
    const el = dom.buildCard(card({ state: 'locked', prerequisiteTitle: null }), { handlers: handlers() });
    assert.equal(el.querySelectorAll('.encounter-card-hint').length, 0);
});

test('coming soon card: badge + release date, not a button, never opens', () => {
    const el = dom.buildCard(card({ state: 'comingSoon', releaseDate: 'Next week' }), { handlers: handlers() });
    assert.equal(el.querySelectorAll('.study-card-open').length, 0);
    assert.equal(el.querySelector('.encounter-badge').textContent, 'COMING SOON');
    assert.equal(el.querySelector('.encounter-card-release').textContent, 'Next week');
    assert.equal(el.getAttribute('aria-disabled'), 'true');
});

test('coming soon without a release date shows no date line', () => {
    const el = dom.buildCard(card({ state: 'comingSoon' }), { handlers: handlers() });
    assert.equal(el.querySelectorAll('.encounter-card-release').length, 0);
});

test('image: one webp <img> from the injected url builder; accent colour placeholder', () => {
    const el = dom.buildCard(card(), { handlers: handlers() });
    const media = el.querySelector('.encounter-card-media');
    assert.equal(media.getAttribute('style'), 'background-color:#1e3a5f');
    assert.equal(el.querySelectorAll('source').length, 0);
    const img = el.querySelector('img');
    assert.equal(img.getAttribute('src'), 'https://cdn.test/peter/peter_intro.webp');
    assert.equal(img.getAttribute('loading'), 'lazy');
    assert.equal(img.getAttribute('alt'), '');
});

test('no intro image or no accent: no <img>, no inline style, still a valid card', () => {
    const el = dom.buildCard(card({ introImage: '', accent: null }), { handlers: handlers() });
    assert.equal(el.querySelectorAll('img').length, 0);
    assert.equal(el.querySelector('.encounter-card-media').getAttribute('style'), null);
});

test('a failing image is hidden so it never blocks reading (C4)', () => {
    const el = dom.buildCard(card(), { handlers: handlers() });
    const img = el.querySelector('img');
    img.dispatch('error');
    assert.equal(img.hidden, true);
});

test('remote strings are text, never markup', () => {
    const el = dom.buildCard(card({ title: '<b>x</b>', accent: 'red;background:url(x)' }), { handlers: handlers() });
    assert.equal(el.querySelector('.study-card-title').textContent, '<b>x</b>');
    assert.equal(el.querySelector('.encounter-card-media').getAttribute('style'), null); // invalid accent never reaches style
});

test('review: replacement patterns in a remote title ($&, $$, $1) never mangle the locked hint', () => {
    const el = dom.buildCard(card({ state: 'locked', prerequisiteTitle: 'Cost $$ of $& Grace $1' }), { handlers: handlers() });
    assert.equal(el.querySelector('.encounter-card-hint').textContent, 'Complete to access: Cost $$ of $& Grace $1');
});

test('the next locked card shows the gold "read it now" pill; other locked cards do not (like the app)', () => {
    const TEXT_NOW = 'Want to read it now? Tap here.';
    const withT = (k) => (k === 'read_now_hint' ? TEXT_NOW : t(k));
    const local = createCardDom({ h: createBuilder(doc), t: withT, imageUrlFor });
    const next = local.buildCard(card({ state: 'locked', isNextLocked: true, prerequisiteTitle: 'Bartimaeus' }), { handlers: handlers() });
    assert.equal(next.querySelector('.encounter-unlock-pill').textContent, TEXT_NOW);
    const other = local.buildCard(card({ state: 'locked', isNextLocked: false, prerequisiteTitle: 'Bartimaeus' }), { handlers: handlers() });
    assert.equal(other.querySelectorAll('.encounter-unlock-pill').length, 0);
});

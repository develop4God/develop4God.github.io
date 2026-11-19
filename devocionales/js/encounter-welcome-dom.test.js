'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'encounter-welcome-dom.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createBuilder } = global.window.DomBuilder;
const { createWelcomeDom } = global.window.EncounterWelcomeDom;

const TEXT = {
    welcome_title_line1: 'They found Him.', welcome_title_line2: 'Changed forever.',
    welcome_title_line3: 'The same Jesus. Here. Now.', welcome_subtitle: 'Real stories. The real Jesus.', welcome_button: 'Begin',
};
const doc = new FakeDocument();
const dom = createWelcomeDom({ h: createBuilder(doc), t: (k) => TEXT[k] || k, imageUrl: '/devocionales/img/encounters-welcome.webp' });

test('B8 shows the three headline lines, the subtitle and the Begin button (same copy as the app)', () => {
    const el = dom.buildWelcome({ onBegin() {} });
    const lines = el.querySelectorAll('.encounter-welcome-line');
    assert.deepEqual(lines.map((l) => l.textContent), ['They found Him.', 'Changed forever.', 'The same Jesus. Here. Now.']);
    assert.ok(lines[2].classList.contains('encounter-welcome-line--gold'));
    assert.equal(el.querySelector('.encounter-welcome-subtitle').textContent, 'Real stories. The real Jesus.');
    assert.equal(el.querySelector('.encounter-welcome-begin').textContent, 'Begin');
});

test('B8 is an accessible modal dialog labelled by its headline', () => {
    const el = dom.buildWelcome({ onBegin() {} });
    assert.equal(el.getAttribute('role'), 'dialog');
    assert.equal(el.getAttribute('aria-modal'), 'true');
    const title = el.querySelector('.encounter-welcome-title');
    assert.equal(el.getAttribute('aria-labelledby'), title.getAttribute('id'));
});

test('B8 the background image is decorative and comes from the given url', () => {
    const img = dom.buildWelcome({ onBegin() {} }).querySelector('img');
    assert.equal(img.getAttribute('src'), '/devocionales/img/encounters-welcome.webp');
    assert.equal(img.getAttribute('alt'), '');
    assert.equal(img.getAttribute('aria-hidden'), 'true');
});

test('B8 Begin calls onBegin exactly once per click and nothing else triggers it', () => {
    let begun = 0;
    const el = dom.buildWelcome({ onBegin: () => { begun += 1; } });
    el.querySelector('.encounter-welcome-subtitle').click();
    assert.equal(begun, 0);
    el.querySelector('.encounter-welcome-begin').click();
    assert.equal(begun, 1);
});

test('B8 Escape dismisses it like Begin (keyboard users are never trapped)', () => {
    let begun = 0;
    const el = dom.buildWelcome({ onBegin: () => { begun += 1; } });
    el.dispatch('keydown', { key: 'Enter' });
    assert.equal(begun, 0);
    el.dispatch('keydown', { key: 'Escape' });
    assert.equal(begun, 1);
});

test('B8 remote or odd strings stay text (never parsed as HTML)', () => {
    const evil = createWelcomeDom({ h: createBuilder(doc), t: () => '<img src=x onerror=alert(1)>', imageUrl: '/x.webp' });
    const el = evil.buildWelcome({ onBegin() {} });
    assert.equal(el.querySelectorAll('img').length, 1); // only the background image
    assert.equal(el.querySelector('.encounter-welcome-begin').textContent, '<img src=x onerror=alert(1)>');
});

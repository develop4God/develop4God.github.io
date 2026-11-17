'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument, FakeElement } = require('./fake-dom.helper');

// Remote devotional content must never be parsed as HTML: make any innerHTML write fail loudly.
Object.defineProperty(FakeElement.prototype, 'innerHTML', {
    configurable: true,
    set() { throw new Error('innerHTML must not be used with remote content'); },
});

const PAYLOAD = '<img src=x onerror=alert(1)>';

// Runs a real browser-IIFE module against global.window.
function load(file) {
    const filename = path.join(__dirname, file);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}

function setup() {
    const doc = new FakeDocument();
    const byId = {};
    ['meditar-accordion', 'tags-wrap', 'tags-list'].forEach((id) => {
        const el = doc.createElement('div');
        el.id = id;
        byId[id] = el;
    });
    global.document = { getElementById: (id) => byId[id] || null, createElement: (t) => doc.createElement(t) };
    global.window = {};
    load('devotional-render-dom.js');
    return { dom: global.window.DevotionalRenderDom, byId };
}

const hasTag = (el, tag) => el.all().some((e) => e.tagName === tag);

test('renderAccordion: renders cita and texto as text, one item per entry', () => {
    const { dom, byId } = setup();
    dom.renderAccordion([{ cita: 'John 3:16', texto: 'God so loved' }, { cita: 'Psalm 23', texto: 'The Lord is my shepherd' }]);
    const items = byId['meditar-accordion'].querySelectorAll('.accordion-item');
    assert.equal(items.length, 2);
    assert.equal(items[0].querySelector('.accordion-title').textContent, 'John 3:16');
    assert.equal(items[0].querySelector('.accordion-content-inner').textContent, 'God so loved');
});

test('renderAccordion: a markup payload in cita or texto stays text and creates no elements', () => {
    const { dom, byId } = setup();
    dom.renderAccordion([{ cita: PAYLOAD, texto: PAYLOAD }]);
    const container = byId['meditar-accordion'];
    assert.equal(hasTag(container, 'IMG'), false);
    assert.equal(container.querySelector('.accordion-title').textContent, PAYLOAD);
    assert.equal(container.querySelector('.accordion-content-inner').textContent, PAYLOAD);
});

test('renderAccordion: clicking the title toggles open and aria-expanded', () => {
    const { dom, byId } = setup();
    dom.renderAccordion([{ cita: 'a', texto: 'b' }]);
    const item = byId['meditar-accordion'].querySelector('.accordion-item');
    const title = item.querySelector('.accordion-title');
    assert.equal(title.getAttribute('aria-expanded'), 'true');
    title.click();
    assert.equal(item.classList.contains('open'), false);
    assert.equal(title.getAttribute('aria-expanded'), 'false');
    title.click();
    assert.equal(item.classList.contains('open'), true);
    assert.equal(title.getAttribute('aria-expanded'), 'true');
});

test('renderAccordion: a second render replaces the first, and empty or missing input clears it', () => {
    const { dom, byId } = setup();
    dom.renderAccordion([{ cita: 'a', texto: 'b' }, { cita: 'c', texto: 'd' }]);
    dom.renderAccordion([{ cita: 'e', texto: 'f' }]);
    assert.equal(byId['meditar-accordion'].querySelectorAll('.accordion-item').length, 1);
    dom.renderAccordion(undefined);
    assert.equal(byId['meditar-accordion'].querySelectorAll('.accordion-item').length, 0);
});

test('renderAccordion: missing cita or texto renders empty text, never "undefined"', () => {
    const { dom, byId } = setup();
    dom.renderAccordion([{}]);
    const item = byId['meditar-accordion'].querySelector('.accordion-item');
    assert.equal(item.querySelector('.accordion-title').textContent, '');
    assert.equal(item.querySelector('.accordion-content-inner').textContent, '');
});

test('renderTags: one pill per tag, rendered as text', () => {
    const { dom, byId } = setup();
    dom.renderTags(['faith', 'hope']);
    const pills = byId['tags-list'].querySelectorAll('.tag-pill');
    assert.deepEqual(pills.map((p) => p.textContent), ['faith', 'hope']);
});

test('renderTags: a markup payload in a tag stays text and creates no elements', () => {
    const { dom, byId } = setup();
    dom.renderTags([PAYLOAD]);
    assert.equal(hasTag(byId['tags-list'], 'IMG'), false);
    assert.equal(byId['tags-list'].querySelector('.tag-pill').textContent, PAYLOAD);
});

test('renderTags: replaces previous pills on re-render; empty or missing tags hide the wrapper', () => {
    const { dom, byId } = setup();
    dom.renderTags(['a', 'b']);
    dom.renderTags(['c']);
    assert.equal(byId['tags-list'].querySelectorAll('.tag-pill').length, 1);
    dom.renderTags([]);
    assert.equal(byId['tags-wrap'].classList.contains('hidden'), true);
    byId['tags-wrap'].classList.remove('hidden');
    dom.renderTags(undefined);
    assert.equal(byId['tags-wrap'].classList.contains('hidden'), true);
});

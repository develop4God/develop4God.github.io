'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
const filename = path.join(__dirname, 'dom-builder.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const { createBuilder } = global.window.DomBuilder;

const doc = new FakeDocument();
const h = createBuilder(doc);

test('h: builds an element with class, text and attributes', () => {
    const el = h('button', { class: 'btn big', text: 'Go', attrs: { type: 'button', 'aria-label': 'Go now' } });
    assert.equal(el.tagName, 'BUTTON');
    assert.ok(el.classList.contains('btn') && el.classList.contains('big'));
    assert.equal(el.textContent, 'Go');
    assert.equal(el.getAttribute('type'), 'button');
    assert.equal(el.getAttribute('aria-label'), 'Go now');
});

test('h: text is never parsed as HTML (XSS payload stays literal text)', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const el = h('p', { text: payload });
    assert.equal(el.textContent, payload);
    assert.equal(el.children.length, 0, 'no element was created from the payload');
});

test('h: attribute values from remote data stay attribute strings', () => {
    const el = h('div', { attrs: { 'data-id': '"><script>x</script>' } });
    assert.equal(el.getAttribute('data-id'), '"><script>x</script>');
});

test('h: appends element children and skips null, undefined and false', () => {
    const el = h('ul', {}, [h('li', { text: 'a' }), null, undefined, false, h('li', { text: 'b' })]);
    assert.deepEqual(el.children.map((c) => c.textContent), ['a', 'b']);
});

test('h: wires event handlers', () => {
    let clicks = 0;
    const el = h('button', { on: { click: () => { clicks += 1; } } });
    el.click();
    assert.equal(clicks, 1);
});

test('h: undefined attribute values are skipped, not written as "undefined"', () => {
    const el = h('a', { attrs: { href: undefined, id: 'x' } });
    assert.equal(el.hasAttribute('href'), false);
    assert.equal(el.getAttribute('id'), 'x');
});

test('h: no options at all is valid', () => {
    assert.equal(h('div').tagName, 'DIV');
});

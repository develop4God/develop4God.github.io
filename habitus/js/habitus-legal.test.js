'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('../../devocionales/js/fake-dom.helper');

global.window = global.window || {};
global.document = { getElementById: () => null };
function load(file) {
    const filename = path.join(__dirname, file);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
load('../../devocionales/js/dom-builder.js');
load('habitus-legal.js');
const { buildLegalBody, render } = global.window.HabitusLegal;

const doc = new FakeDocument();
const tags = (nodes) => nodes.map((n) => n.tagName);

test('terms: welcome, titled sections, subsections and the section 3 list are built in order', () => {
    const nodes = buildLegalBody(doc, 'terms', {
        welcome: 'W', section1_title: 'S1', section1_text: 'T1',
        section2_title: 'S2', section2_1_title: 'S21', section2_1_text: 'T21',
        section3_title: 'S3', section3_text: 'T3', section3_list1: 'a', section3_list2: 'b',
        section4_title: 'S4', section4_text: 'T4',
    });
    assert.deepEqual(tags(nodes), ['P', 'H2', 'P', 'H2', 'H3', 'P', 'H2', 'P', 'UL', 'H2', 'P']);
    assert.equal(nodes[8].children.length, 2);
});

test('privacy: description first, nested section 1 list with purposes, note, flat and titled list items', () => {
    const nodes = buildLegalBody(doc, 'privacy', {
        description: 'D', section1_title: 'S1', section1_text: 'T1',
        section1_list1_title: 'Id:', section1_list1_text: 'x', section1_list1_purpose: 'Purpose:', section1_list1_purpose_text: 'y',
        important_note_title: 'Note:', important_note_text: 'z',
        section2_title: 'S2', section2_list1_title: 'Fav:', section2_list1_text: 'f',
        section4_title: 'S4', section4_list1: 'flat',
    });
    assert.deepEqual(tags(nodes), ['P', 'H2', 'P', 'UL', 'P', 'H2', 'UL', 'H2', 'UL']);
    const item = nodes[3].children[0];
    assert.deepEqual(item.children.map((c) => c.tagName), ['STRONG', 'UL']);
    assert.match(item.children[1].textContent, /Purpose:/);
    assert.match(item.children[1].textContent, /y/);
});

test('remote strings stay text: markup in a value is never parsed', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const [p] = buildLegalBody(doc, 'terms', { welcome: payload });
    assert.equal(p.textContent, payload);
    assert.equal(p.children.length, 0);
});

test('missing or empty legal block yields no nodes instead of throwing', () => {
    assert.deepEqual(buildLegalBody(doc, 'terms', undefined), []);
    assert.deepEqual(buildLegalBody(doc, 'terms', {}), []);
});

test('unknown kind yields no nodes', () => {
    assert.deepEqual(buildLegalBody(doc, 'nope', { welcome: 'W' }), []);
});

test('render: replaces the container content, and rendering twice does not duplicate', () => {
    const container = doc.createElement('div');
    container.setAttribute('data-legal-kind', 'terms');
    const translations = { legal: { terms: { welcome: 'W', section1_title: 'S1' } } };
    render(doc, container, translations);
    render(doc, container, translations);
    assert.equal(container.children.length, 2);
});

test('render: clears the container when the language has no legal block', () => {
    const container = doc.createElement('div');
    container.setAttribute('data-legal-kind', 'privacy');
    container.append(doc.createElement('p'));
    render(doc, container, {});
    assert.equal(container.children.length, 0);
});

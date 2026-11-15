'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseTags } = require('./html-tags.js');

const named = (html, name) => parseTags(html).filter((tag) => tag.name === name);

test('parseTags reads double-quoted, single-quoted and unquoted attribute values', () => {
    const [a, b, c] = parseTags('<script src="/a.js"></script><script src=\'/b.js\'></script><script src=/c.js></script>');
    assert.deepEqual([a.attrs.src, b.attrs.src, c.attrs.src], ['/a.js', '/b.js', '/c.js']);
});

test('parseTags does not end a tag at a ">" inside a quoted value', () => {
    const [img] = named('<img alt="a > b" src="/x.png">', 'img');
    assert.equal(img.attrs.src, '/x.png');
    assert.equal(img.attrs.alt, 'a > b');
});

test('parseTags handles valueless attributes, mixed case, spacing around "=" and a self-closing slash', () => {
    const [script, link] = parseTags('<SCRIPT ASYNC  SRC = "/a.js" defer></SCRIPT><link rel=stylesheet href=/s.css />');
    assert.equal(script.attrs.src, '/a.js');
    assert.equal(script.attrs.async, '');
    assert.equal(link.attrs.rel, 'stylesheet');
    assert.equal(link.attrs.href, '/s.css');
});

test('parseTags skips comments, including tags inside them and ">" inside them', () => {
    const tags = parseTags('<!-- <script src="/old.js"></script> > --><script src="/new.js"></script>');
    assert.deepEqual(tags.map((tag) => tag.attrs.src), ['/new.js']);
});

test('parseTags keeps script and style bodies as raw text, so "<" inside them is not a tag', () => {
    const tags = parseTags('<script>if (a<b) { x = "<img src=/no.png>"; }</script><style>a{background:url(/f.woff2)}</style><img src="/yes.png">');
    assert.deepEqual(tags.map((tag) => tag.name), ['script', 'style', 'img']);
    assert.equal(tags[1].body, 'a{background:url(/f.woff2)}');
    assert.equal(tags[2].attrs.src, '/yes.png');
});

test('parseTags ignores the doctype, closing tags and a lone "<" in text', () => {
    const tags = parseTags('<!DOCTYPE html><p>1 < 2 and 3 <4</p><img src="/x.png">');
    assert.deepEqual(tags.map((tag) => tag.name), ['p', 'img']);
});

test('parseTags uses the first of a repeated attribute, like a browser', () => {
    assert.equal(named('<img src="/a.png" src="/b.png">', 'img')[0].attrs.src, '/a.png');
});

test('parseTags fails loudly on markup it cannot understand', () => {
    for (const broken of [
        '<script src="/a.js"',
        '<img src="/a.png>',
        '<!-- never closed <script src="/a.js"></script>',
        '<script src="/a.js">never closed',
        '<style>a{}',
        '<link rel=',
    ]) {
        assert.throws(() => parseTags(broken), /Cannot parse HTML/, broken);
    }
});

test('parseTags names the position of the problem', () => {
    assert.throws(() => parseTags('<p>ok</p>\n<img src="/a.png'), /offset 10/);
});

test('parseTags on empty input is empty', () => {
    assert.deepEqual(parseTags(''), []);
});

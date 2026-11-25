'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const SHARED = 'devocionales/css/celebration.css';

test('the confetti styles live once, in the shared celebration stylesheet', () => {
    const css = read(SHARED);
    assert.match(css, /\.celebration\s*\{/);
    assert.match(css, /\.confetti-piece\s*\{/);
    assert.match(css, /@keyframes confetti-fall/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    for (let n = 1; n <= 28; n += 1) {
        assert.ok(css.includes(`.confetti-piece:nth-child(${n})`), `piece ${n} has no position rule`);
    }
});

test('the Bible-studies stylesheet imports the shared file instead of keeping its own copy', () => {
    const css = read('devocionales/css/discovery.css');
    assert.match(css, /@import url\(["']?celebration\.css["']?\);/);
    assert.doesNotMatch(css, /\.confetti-piece/);
    assert.doesNotMatch(css, /@keyframes confetti-fall/);
    // @import is only valid before every rule: nothing but comments may come first.
    const beforeImport = css.slice(0, css.search(/@import/)).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    assert.equal(beforeImport, '');
});

test('the Apóyanos page uses the shared stylesheet and carries no confetti rules of its own', () => {
    const html = read('apoyanos/index.html');
    assert.match(html, /<link rel="stylesheet" href="\/devocionales\/css\/celebration\.css">/);
    assert.doesNotMatch(html, /\.confetti-piece/);
    assert.doesNotMatch(html, /@keyframes confetti-fall/);
});

test('the widget script says which stylesheet it needs', () => {
    assert.match(read('devocionales/js/ui-celebration.js'), /css\/celebration\.css/);
});

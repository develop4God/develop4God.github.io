const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('install button carries the shine class', () => {
    assert.match(html, /id="install-app-btn"[^>]*class="[^"]*\bbtn-shine\b/);
});

test('shine sweep is an animated pseudo-element', () => {
    assert.match(html, /\.btn-shine::after\s*{[^}]*animation:\s*btn-shine-sweep/);
    assert.match(html, /@keyframes btn-shine-sweep/);
});

test('shine is switched off for reduced motion', () => {
    const reduced = html.match(/@media \(prefers-reduced-motion: reduce\)\s*{[^}]*\.btn-shine::after\s*{\s*animation:\s*none/);
    assert.ok(reduced, 'reduced-motion rule must disable the shine');
});

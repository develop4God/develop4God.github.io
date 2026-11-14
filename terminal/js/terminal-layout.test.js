const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'terminal-layout.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const L = global.window.TerminalLayout;

const W = 280;
const H = 597;

test('wide screens keep scenes on the right, whatever the free height', () => {
  const p = L.place('pipeline', true, 50, 1200, 700);
  assert.deepStrictEqual(p, { x: 0.68, y: 0.5, s: 0.3 });
});

test('narrow screens with unknown free height keep the default placement', () => {
  const p = L.place('pipeline', false, 0, W, H);
  assert.deepStrictEqual(p, { x: 0.5, y: 0.3, s: 0.24 });
});

test('narrow screens shrink and lift a scene so it ends above the text', () => {
  const free = 150;
  const p = L.place('pipeline', false, free, W, H);
  const bottom = p.y * H + p.s * Math.min(W, H);
  assert.ok(bottom <= free, `scene bottom ${bottom} must not pass the free height ${free}`);
  assert.ok(p.s >= 0.05 && p.s <= 0.24);
});

test('wide scenes such as the lattice cube keep clear of the text with a 1.3x extent', () => {
  const free = 150;
  ['lattice', 'device', 'languages', 'globe'].forEach((id) => {
    const p = L.place(id, false, free, 320, 568);
    const bottom = p.y * 568 + p.s * 320 * 1.3;
    assert.ok(bottom <= free, `${id}: bottom ${bottom} must not pass ${free}`);
  });
});

test('a roomy free height does not enlarge a scene past its default', () => {
  const p = L.place('pipeline', false, 5000, W, H);
  assert.deepStrictEqual(p, { x: 0.5, y: 0.3, s: 0.24 });
});

test('a tiny free height still leaves a visible minimum scale', () => {
  const p = L.place('lattice', false, 4, W, H);
  assert.strictEqual(p.s, 0.05);
});

test('the twin scene keeps its own caps and still fits the free height', () => {
  assert.deepStrictEqual(L.place('twin', false, 0, W, H), { x: 0.5, y: 0.27, s: 0.2 });
  assert.deepStrictEqual(L.place('twin', true, 0, 1200, 700), { x: 0.5, y: 0.25, s: 0.17 });
  const p = L.place('twin', false, 150, W, H);
  assert.ok(p.y * H + p.s * Math.min(W, H) <= 150);
});

test('the logo ignores the free height so its build-up is unchanged', () => {
  const p = L.place('logo', false, 50, W, H);
  assert.deepStrictEqual(p, { x: 0.5, y: 0.3, s: 0.24 * 0.83 });
});

test('globe and languages are scaled down on both layouts', () => {
  assert.strictEqual(L.place('globe', true, 0, 1200, 700).s, 0.3 * 0.85);
  assert.strictEqual(L.place('languages', false, 0, W, H).s, 0.24 * 0.85);
});

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global.window || {};
function load(file) {
  const filename = path.join(__dirname, file);
  vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
load('terminal-math.js');
load('terminal-logo-image.js');
const L = global.window.TerminalLogoImage;

test('revealProgress: nothing before the build-up starts', () => {
  assert.strictEqual(L.revealProgress(0, 0), 0);
  assert.strictEqual(L.revealProgress(-1, 0), 0);
});

test('revealProgress: fades in monotonically to exactly 1 and holds', () => {
  let prev = 0;
  for (let t = 0; t <= L.REVEAL_FADE; t += 50) {
    const a = L.revealProgress(t, 0);
    assert.ok(a >= prev, 'monotonic at ' + t);
    prev = a;
  }
  assert.strictEqual(L.revealProgress(L.REVEAL_FADE, 0), 1);
  assert.strictEqual(L.revealProgress(1e7, 0), 1);
});

test('revealProgress: dissolves to 0 early in the morph to the next scene, never before it starts', () => {
  const t = 1e7;
  assert.strictEqual(L.revealProgress(t, 0), 1);
  assert.ok(L.revealProgress(t, 0.1) < 1);
  assert.strictEqual(L.revealProgress(t, L.LEAVE_SPAN), 0);
  assert.strictEqual(L.revealProgress(t, 1), 0);
});

test('revealProgress: invalid or negative time is treated as not yet revealed', () => {
  assert.strictEqual(L.revealProgress(-5, 0), 0);
  assert.strictEqual(L.revealProgress(NaN, 0), 0);
});

test('tintWordmark recolours only low-saturation pixels in the wordmark rows, keeping alpha', () => {
  // 1x3 image: row0 grey (shield area), row1 grey (wordmark), row2 gold (wordmark)
  const d = new Uint8ClampedArray([90, 90, 90, 255, 90, 90, 90, 200, 220, 170, 60, 255]);
  L.tintWordmark(d, 1, 3, 1, [250, 250, 250]);
  assert.deepStrictEqual(Array.from(d.slice(0, 4)), [90, 90, 90, 255]);
  assert.deepStrictEqual(Array.from(d.slice(4, 8)), [250, 250, 250, 200]);
  assert.deepStrictEqual(Array.from(d.slice(8, 12)), [220, 170, 60, 255]);
});

test('tintWordmark leaves fully transparent pixels untouched', () => {
  const d = new Uint8ClampedArray([10, 10, 10, 0]);
  L.tintWordmark(d, 1, 1, 0, [250, 250, 250]);
  assert.deepStrictEqual(Array.from(d), [10, 10, 10, 0]);
});

test('morphProgress: dots hold still while the image dissolves, then morph from 0 to 1', () => {
  assert.strictEqual(L.morphProgress(0), 0);
  assert.strictEqual(L.morphProgress(L.LEAVE_SPAN), 0);
  assert.ok(L.morphProgress(0.7) > 0 && L.morphProgress(0.7) < 1);
  assert.strictEqual(L.morphProgress(1), 1);
});

test('the image is fully gone exactly when the dots start to move', () => {
  assert.strictEqual(L.revealProgress(1e7, L.LEAVE_SPAN), 0);
  assert.strictEqual(L.morphProgress(L.LEAVE_SPAN), 0);
});

test('densePoints: one dot per step x step cell, in the pixel colour, inside the image', () => {
  const w = 8, h = 8, d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set([200, 100, 50, 255], i * 4);
  const pts = L.densePoints(d, w, h, 2, () => 0.5);
  assert.strictEqual(pts.length, 16);
  assert.strictEqual(pts[0].key, L.colorKey(200, 100, 50));
  assert.ok(pts.every((p) => p.tx >= 0 && p.tx < w && p.ty >= 0 && p.ty < h));
  assert.ok(pts.every((p) => p.dl >= 0 && p.dl <= 1 && Number.isFinite(p.sx) && Number.isFinite(p.sy)));
});

test('densePoints: skips transparent pixels but keeps near-white highlights, and yields nothing for an empty image', () => {
  const d = new Uint8ClampedArray([0, 0, 0, 0, 250, 250, 250, 255, 10, 20, 30, 255, 10, 20, 30, 100]);
  assert.strictEqual(L.densePoints(d, 4, 1, 1, () => 0.5).length, 2);
  assert.deepStrictEqual(L.densePoints(new Uint8ClampedArray(0), 0, 0, 2, () => 0.5), []);
});

test('dotPhase: a dot is absent at r=0 and home at r=1 whatever its delay, and arrives monotonically', () => {
  [0, 0.3, 0.7, 1].forEach((dl) => {
    assert.strictEqual(L.dotPhase(0, dl), 0);
    assert.strictEqual(L.dotPhase(1, dl), 1);
    let prev = 0;
    for (let r = 0; r <= 1; r += 0.02) { const e = L.dotPhase(r, dl); assert.ok(e >= prev); prev = e; }
  });
  assert.ok(L.dotPhase(0.2, 0) > L.dotPhase(0.2, 1), 'low-delay dots arrive first');
});

test('the dot count grows steadily: dots arrive spread over the reveal, not all at once', () => {
  const dls = Array.from({ length: 200 }, (_, i) => i / 199);
  const present = (r) => dls.filter((dl) => L.dotPhase(r, dl) > 0).length;
  assert.ok(present(0.1) < present(0.4) && present(0.4) < present(0.7));
  assert.ok(present(0.1) > 0 && present(0.1) < 200);
  assert.strictEqual(present(1), 200);
});

test('pngAlpha: the crisp image only appears once the dot field is complete', () => {
  assert.strictEqual(L.pngAlpha(0.5), 0);
  assert.strictEqual(L.pngAlpha(0.9), 0);
  assert.strictEqual(L.pngAlpha(1), 1);
});

test('colorKey / keyRgb: 4096 buckets, and a bucket colour stays close to the colour that made it', () => {
  assert.strictEqual(L.colorKey(0, 0, 0), 0);
  assert.strictEqual(L.colorKey(255, 255, 255), L.COLOR_KEYS - 1);
  assert.strictEqual(L.COLOR_KEYS, 4096);
  [[200, 100, 50], [10, 240, 128], [255, 0, 255], [143, 127, 208]].forEach((c) => {
    const k = L.colorKey(c[0], c[1], c[2]);
    assert.ok(k >= 0 && k < L.COLOR_KEYS);
    L.keyRgb(k).forEach((v, i) => assert.ok(Math.abs(v - c[i]) <= 8, 'channel ' + i));
  });
});

test('densePoints precomputes each dot colour bucket', () => {
  const d = new Uint8ClampedArray([200, 100, 50, 255]);
  assert.strictEqual(L.densePoints(d, 1, 1, 1, () => 0.5)[0].key, L.colorKey(200, 100, 50));
});

test('leaveMs: how long the logo takes to dissolve at a given morph speed, with a small margin', () => {
  const ms = L.leaveMs(0.5);
  assert.ok(ms >= (L.LEAVE_SPAN / 0.5) * 1000);
  assert.ok(ms <= (L.LEAVE_SPAN / 0.5) * 1000 + 250);
  assert.ok(L.leaveMs(1) < L.leaveMs(0.5));
  assert.strictEqual(L.leaveMs(0), 0);
  assert.strictEqual(L.leaveMs(-1), 0);
});

test('returnAlpha: coming back to the logo, the image fades in over the last stretch only', () => {
  assert.strictEqual(L.returnAlpha(1), 0);
  assert.strictEqual(L.returnAlpha(L.RETURN_SPAN), 0);
  assert.strictEqual(L.returnAlpha(0), 1);
  assert.ok(L.returnAlpha(L.RETURN_SPAN / 2) > 0 && L.returnAlpha(L.RETURN_SPAN / 2) < 1);
  let prev = 0;
  for (let lt = 1; lt >= 0; lt -= 0.02) { const a = L.returnAlpha(lt); assert.ok(a >= prev); prev = a; }
});

test('the image is solid again exactly when the dots are back in place', () => {
  assert.strictEqual(L.morphProgress(L.LEAVE_SPAN), 0);
  assert.ok(L.RETURN_SPAN <= L.LEAVE_SPAN, 'image only fades in once the dots have settled');
});

test('isRevealed: only after the first build-up has finished', () => {
  assert.strictEqual(L.isRevealed(0), false);
  assert.strictEqual(L.isRevealed(L.REVEAL_FADE - 1), false);
  assert.strictEqual(L.isRevealed(L.REVEAL_FADE), true);
  assert.strictEqual(L.isRevealed(NaN), false);
});

test('viewState: reduced motion shows the real image alone', () => {
  const v = L.viewState(0, 0, false, true);
  assert.deepStrictEqual([v.pngA, v.pm, v.dense, v.back], [1, 0, false, false]);
});

test('viewState: first visit is one build-up, the dense dots filling in, then the solid image; no sparse-dot stage', () => {
  const start = L.viewState(0, 0, false, false), mid = L.viewState(L.REVEAL_FADE / 2, 0, false, false), done = L.viewState(1e7, 0, false, false);
  assert.deepStrictEqual([start.pm, start.pngA, start.dense], [0, 0, false]);
  assert.ok(mid.dense && mid.pm === 0 && mid.pngA === 0);
  assert.deepStrictEqual([done.pm, done.pngA, done.dense], [0, 1, false]);
});

test('viewState: leaving scatters the dense dots while the sparse dots fade in underneath', () => {
  const v = L.viewState(1e7, L.LEAVE_SPAN / 2, false, false);
  assert.ok(v.dense && !v.back && v.pngA < 1);
  assert.ok(v.pm > 0 && v.pm < 1);
  assert.strictEqual(L.viewState(1e7, 0, false, false).pm, 0);
  assert.strictEqual(L.viewState(1e7, L.LEAVE_SPAN, false, false).pm, 1);
});

test('viewState: skipping ahead mid-build does not make the sparse dots pop in', () => {
  const t = L.REVEAL_FADE / 2;
  assert.strictEqual(L.viewState(t, 0, false, false).pm, 0);
  assert.ok(L.viewState(t, 0.01, false, false).pm < 0.05);
});

test('viewState: heading back after the first build-up fades the image in with no dense dots', () => {
  const v = L.viewState(1e7, L.RETURN_SPAN / 2, true, false);
  assert.ok(v.back && !v.dense);
  assert.ok(Math.abs(v.pm - (1 - v.pngA)) < 1e-9);
  assert.strictEqual(L.viewState(1e7, 0.9, true, false).pngA, 0);
});

test('viewState: heading back before the first build-up has finished uses the normal path; at rest it is solid', () => {
  assert.strictEqual(L.viewState(10, 0.2, true, false).back, false);
  const rest = L.viewState(1e7, 0, true, false);
  assert.deepStrictEqual([rest.back, rest.pngA, rest.pm], [false, 1, 0]);
});

test('viewState exposes the reveal progress that drives each dense dot', () => {
  const v = L.viewState(L.REVEAL_FADE / 2, 0, false, false);
  assert.ok(v.rv > 0 && v.rv < 1);
  assert.strictEqual(L.viewState(1e7, 0.9, true, false).rv, 0);
});

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
load('terminal-world-mask.js');
load('terminal-globe.js');
load('terminal-globe-layer.js');
const M = global.window.TerminalMath;
const G = global.window.TerminalGlobe;
const GL = global.window.TerminalGlobeLayer;

const RADIUS = 1.25, SCENE_DOTS = 1800, PAL = ['ink', 'lime', 'gold', 'violet'], COLOURS = [3, 1, 2], VIOLET = 3;

// A 2D context that records every fill: its style, its opacity and how many dots it drew.
function fakeCtx() {
  const fills = [];
  let arcs = 0;
  return {
    fills,
    fillStyle: '',
    globalAlpha: 1,
    beginPath() { arcs = 0; },
    moveTo() {},
    arc() { arcs++; },
    fill() { fills.push({ style: this.fillStyle, alpha: this.globalAlpha, dots: arcs }); }
  };
}
function layer() {
  return GL.create({ radius: RADIUS, colours: COLOURS, violet: VIOLET, sceneDots: SCENE_DOTS, litDark: 0.95 });
}
const frame = (over) => Object.assign({ ox: 300, oy: 300, scale: 160, dark: true, fade: 1, cam: G.ORTHO_CAMERA }, over);
const total = (ctx, pred) => ctx.fills.filter(pred).reduce((n, f) => n + f.dots, 0);

test('scene dots show even before the extra layer is built; a built layer adds the extra land, ocean and ring', () => {
  const l = layer(), early = fakeCtx(), ctx = fakeCtx();
  l.begin(frame());
  l.addDot(1, -1, 5, 5);
  l.draw(early, PAL);
  assert.strictEqual(total(early, (f) => f.style === 'lime'), 1, 'the scene dot is drawn without the extras');
  assert.strictEqual(total(early, (f) => f.style === 'violet'), 0, 'no ocean or ring yet');
  assert.strictEqual(l.build(), true);
  l.begin(frame());
  l.addExtras(M.rotation(0, 0));
  l.draw(ctx, PAL);
  const sea = total(ctx, (f) => f.style === 'violet' && f.alpha < 0.6 && f.dots > 0 && f.alpha > 0.4);
  assert.ok(total(ctx, () => true) >= G.LAND_EXTRA + G.SEA_DOTS + G.RING_DOTS - 1, 'every dot is drawn once');
  assert.ok(sea > 0 && sea < G.SEA_DOTS, 'the near ocean is drawn at its own opacity');
});

test('opacities are exact: near land, far land, near ocean, far ocean and ring, scaled by the fade', () => {
  const l = layer(), ctx = fakeCtx();
  l.build();
  l.begin(frame({ fade: 0.5 }));
  l.addExtras(M.rotation(0, 0));
  l.draw(ctx, PAL);
  const alphas = new Set(ctx.fills.map((f) => +f.alpha.toFixed(6)));
  const expected = [
    G.SEA_BACK_ALPHA * 0.95 * 0.5, G.SEA_ALPHA * 0.95 * 0.5,
    G.landAlpha(true, 0.95, 0.5), G.landAlpha(false, 0.95, 0.5)
  ].map((v) => +v.toFixed(6));
  expected.forEach((v) => assert.ok(alphas.has(v), 'has opacity ' + v));
  assert.ok(![...alphas].some((a) => Math.abs(a - G.RING_ALPHA) < 1e-6), 'no ring while the globe is still fading');
});

test('the ring closes only once the globe has settled and is drawn on the silhouette', () => {
  const l = layer(), ctx = fakeCtx();
  l.build();
  l.begin(frame({ fade: 1 }));
  l.draw(ctx, PAL);
  const ring = ctx.fills.filter((f) => f.style === 'violet' && f.dots === G.RING_DOTS);
  assert.strictEqual(ring.length, 1);
  assert.ok(ring[0].alpha > 0 && ring[0].alpha <= 0.55 + 1e-9);
  const half = fakeCtx();
  l.begin(frame({ fade: 0.5 }));
  l.draw(half, PAL);
  assert.ok(!half.fills.some((f) => f.dots === G.RING_DOTS), 'no ring mid-morph');
});

test('shows() is true only while the globe is visible enough to be worth drawing', () => {
  const l = layer();
  l.begin(frame({ fade: 0 }));
  assert.strictEqual(l.shows(), false);
  l.begin(frame({ fade: GL.MIN_FADE }));
  assert.strictEqual(l.shows(), false, 'at the threshold it is still hidden');
  l.begin(frame({ fade: 0.5 }));
  assert.strictEqual(l.shows(), true);
});

test('a faded-out globe draws nothing and costs no projection', () => {
  const l = layer(), ctx = fakeCtx();
  l.build();
  l.begin(frame({ fade: 0.01 }));
  l.addDot(1, -1, 5, 5);
  l.addExtras(M.rotation(0, 0));
  l.draw(ctx, PAL);
  assert.strictEqual(ctx.fills.length, 0);
});

test('scene dots go to the colour of their continent, near and far, and frames start clean', () => {
  const l = layer(), ctx = fakeCtx();
  l.build();
  l.begin(frame());
  l.addDot(1, -1, 10, 10);
  l.addDot(1, -0.5, 20, 20);
  l.addDot(2, 0.9, 30, 30);
  l.draw(ctx, PAL);
  const lime = ctx.fills.filter((f) => f.style === 'lime'), gold = ctx.fills.filter((f) => f.style === 'gold');
  assert.strictEqual(total({ fills: lime }, () => true), 2);
  assert.strictEqual(total({ fills: gold }, () => true), 1);
  assert.ok(lime[0].alpha > gold[0].alpha * 5, 'near is far brighter than far');
  const again = fakeCtx();
  l.begin(frame());
  l.draw(again, PAL);
  assert.strictEqual(total(again, (f) => f.style === 'lime' || f.style === 'gold'), 0, 'begin clears the previous frame');
});

test('more scene dots than the layer holds are ignored, never thrown or written out of bounds', () => {
  const l = layer(), ctx = fakeCtx();
  l.build();
  l.begin(frame());
  for (let i = 0; i < 20000; i++) l.addDot(0, -1, i, i);
  assert.doesNotThrow(() => l.draw(ctx, PAL));
  assert.ok(total(ctx, (f) => f.style === 'violet') <= SCENE_DOTS + G.LAND_EXTRA + G.SEA_DOTS + G.RING_DOTS);
});

test('a failed build is contained: logged once, never retried, and the scene dots still show', () => {
  const real = G.sea, errors = [];
  const log = console.error;
  console.error = (...a) => errors.push(a);
  let calls = 0;
  G.sea = () => { calls++; throw new Error('boom'); };
  try {
    const l = layer(), ctx = fakeCtx();
    assert.strictEqual(l.build(), false);
    assert.strictEqual(l.build(), false);
    l.begin(frame());
    l.addDot(1, -1, 1, 1);
    l.addExtras(M.rotation(0, 0));
    assert.doesNotThrow(() => l.draw(ctx, PAL));
    assert.strictEqual(ctx.fills.length, 1, 'only the scene dot is drawn: no ocean, extra land or ring');
    assert.strictEqual(ctx.fills[0].style, 'lime');
    assert.strictEqual(calls, 1, 'not retried');
    assert.strictEqual(errors.length, 1);
  } finally {
    G.sea = real;
    console.error = log;
  }
});

test('building twice reuses the same layer', () => {
  const real = G.sea;
  let calls = 0;
  G.sea = (...a) => { calls++; return real(...a); };
  try {
    const l = layer();
    l.build();
    l.build();
    assert.strictEqual(calls, 1);
  } finally { G.sea = real; }
});

test('the two ocean fills come first, so every land dot is drawn over the ocean', () => {
  const l = layer(), ctx = fakeCtx();
  l.build();
  l.begin(frame());
  l.addExtras(M.rotation(0, 0));
  l.draw(ctx, PAL);
  assert.ok(Math.abs(ctx.fills[0].alpha - G.SEA_BACK_ALPHA * 0.95) < 1e-9, 'far ocean first');
  assert.ok(Math.abs(ctx.fills[1].alpha - G.SEA_ALPHA * 0.95) < 1e-9, 'then near ocean');
  assert.ok(ctx.fills.slice(2).every((f) => f.alpha < G.SEA_ALPHA * 0.95 + 1e-9 || f.alpha > G.SEA_ALPHA * 0.95 - 1e-9), 'land follows');
});

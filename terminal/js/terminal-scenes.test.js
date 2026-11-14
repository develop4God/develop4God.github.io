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
load('terminal-scenes.js');
const S = global.window.TerminalScenes;

const IDS = ['cloud', 'twin', 'pipeline', 'languages', 'lattice', 'device', 'globe'];

test('every scene has exactly N points with parallel metadata and finite coordinates', () => {
  IDS.forEach((id) => {
    const sc = S.make(id);
    assert.strictEqual(sc.id, id);
    assert.strictEqual(sc.pts.length, S.N, id);
    assert.strictEqual(sc.grp.length, S.N, id);
    assert.strictEqual(sc.frac.length, S.N, id);
    assert.strictEqual(sc.seed.length, S.N, id);
    sc.pts.forEach((p) => p.forEach((v) => assert.ok(Number.isFinite(v), id)));
  });
});

test('make is deterministic and rejects unknown scene ids', () => {
  assert.deepStrictEqual(S.make('globe').pts.slice(0, 20), S.make('globe').pts.slice(0, 20));
  assert.throws(() => S.make('nope'), /unknown scene/i);
});

test('scene group counts match what each scene paints', () => {
  const count = (sc) => sc.grp.reduce((m, g) => { m[g] = (m[g] || 0) + 1; return m; }, {});
  assert.deepStrictEqual(count(S.make('twin')), { 0: S.N / 2, 1: S.N / 2 });
  assert.strictEqual(Object.keys(count(S.make('pipeline'))).length, 5);
  assert.strictEqual(Object.keys(count(S.make('languages'))).length, 10);
  assert.strictEqual(Object.keys(count(S.make('lattice'))).length, 3);
});

test('paint writes a palette index in range and alpha in [0,1] for every scene', () => {
  const out = { c: -1, a: -1 };
  IDS.forEach((id) => {
    const sc = S.make(id);
    for (let i = 0; i < S.N; i += 37) {
      S.paint(sc, i, 1234, out);
      assert.ok(out.c >= 0 && out.c <= 3, id);
      assert.ok(out.a >= 0 && out.a <= 1, id);
    }
  });
});

test('languages scene lights exactly one cluster at a time', () => {
  const sc = S.make('languages'), out = {};
  const lit = (t) => { let n = 0; for (let i = 0; i < S.N; i++) { S.paint(sc, i, t, out); if (out.c === S.GOLD) n++; } return n; };
  assert.strictEqual(lit(0), S.N / 10);
  assert.strictEqual(lit(900), S.N / 10);
});

test('logoScene splits points between wordmark and shield by the wordmark share, and rejects empty input', () => {
  const px = [];
  for (let i = 0; i < 400; i++) px.push([i % 20, i < 300 ? 10 : 90, i % 4]);
  const sc = S.logoScene({ shield: px.slice(0, 300), text: px.slice(300) }, 0.4);
  assert.strictEqual(sc.id, 'logo');
  assert.strictEqual(sc.pts.length, S.N);
  const text = sc.grp.filter((g) => g === 1).length;
  assert.strictEqual(text, Math.round(S.N * 0.4));
  assert.throws(() => S.logoScene({ shield: [], text: [] }, 0.4), /no logo pixels/i);
});

test('classifyLogoPixel maps ink, lime, violet and gold, and drops transparent or white pixels', () => {
  assert.strictEqual(S.classifyLogoPixel(60, 60, 60, 255), S.INK);
  assert.strictEqual(S.classifyLogoPixel(150, 200, 60, 255), S.LIME);
  assert.strictEqual(S.classifyLogoPixel(90, 70, 160, 255), S.VIOLET);
  assert.strictEqual(S.classifyLogoPixel(220, 170, 60, 255), S.GOLD);
  assert.strictEqual(S.classifyLogoPixel(60, 60, 60, 20), -1);
  assert.strictEqual(S.classifyLogoPixel(250, 250, 250, 255), -1);
});

test('logoScene spreads points evenly: no two share a pixel on a field with room for all of them', () => {
  const px = [];
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) px.push([x, y, S.VIOLET]);
  const sc = S.logoScene({ shield: px, text: [] }, 0);
  const seen = new Set(sc.pts.map((p) => p[0] + ',' + p[1]));
  assert.strictEqual(seen.size, S.N);
});

test('logoScene favours gold detail over the large violet fill', () => {
  const px = [];
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) px.push([x, y, x < 50 ? S.GOLD : S.VIOLET]);
  const sc = S.logoScene({ shield: px, text: [] }, 0);
  const gold = sc.cls.filter((c) => c === S.GOLD).length;
  assert.ok(gold / S.N > 0.6, 'gold share ' + gold / S.N);
});

test('logoScene paints the grey wordmark in the shared violet, never in ink', () => {
  const px = [];
  for (let i = 0; i < 200; i++) px.push([i, i % 7, i % 4]);
  const sc = S.logoScene({ shield: px.slice(0, 100), text: px.slice(100) }, 0.4);
  assert.ok(!sc.cls.includes(S.INK));
  assert.ok(sc.cls.includes(S.VIOLET) && sc.cls.includes(S.GOLD) && sc.cls.includes(S.LIME));
});

test('the twin scene sits its two spheres at +/- TWIN_CENTER_X, which the canvas pivots on', () => {
  const sc = S.make('twin');
  const mean = (g) => { let s = 0, n = 0; sc.pts.forEach((p, i) => { if (sc.grp[i] === g) { s += p[0]; n++; } }); return s / n; };
  assert.ok(Math.abs(mean(0) + S.TWIN_CENTER_X) < 0.01);
  assert.ok(Math.abs(mean(1) - S.TWIN_CENTER_X) < 0.01);
});

test('twinCenter gives the left centre for sphere 0 and the right one for sphere 1', () => {
  assert.strictEqual(S.twinCenter(0), -S.TWIN_CENTER_X);
  assert.strictEqual(S.twinCenter(1), S.TWIN_CENTER_X);
});

test('the two fork spheres keep a clear gap: at least 40% of a sphere width apart, and never overlapping', () => {
  const sc = S.make('twin'), reach = [0, 0];
  sc.pts.forEach((p, i) => { const g = sc.grp[i]; reach[g] = Math.max(reach[g], Math.abs(p[0] - (g ? 1 : -1) * S.TWIN_CENTER_X)); });
  const gap = 2 * S.TWIN_CENTER_X - reach[0] - reach[1];
  assert.ok(gap >= 0.4 * 2 * Math.max(reach[0], reach[1]), `gap ${gap.toFixed(2)}`);
});

test('fork spheres are mostly the shared violet, each with its own accent (lime = hire, gold = ministry)', () => {
  const sc = S.make('twin'), out = { c: 0, a: 0 }, seen = [{}, {}];
  for (let i = 0; i < S.N; i++) { S.paint(sc, i, 0, out); seen[sc.grp[i]][out.c] = (seen[sc.grp[i]][out.c] || 0) + 1; }
  assert.deepStrictEqual(Object.keys(seen[0]).map(Number).sort(), [S.LIME, S.VIOLET].sort());
  assert.deepStrictEqual(Object.keys(seen[1]).map(Number).sort(), [S.GOLD, S.VIOLET].sort());
  [[0, S.LIME], [1, S.GOLD]].forEach(([g, accent]) => {
    const total = seen[g][S.VIOLET] + seen[g][accent];
    assert.ok(seen[g][S.VIOLET] / total > 0.55, 'violet is the majority');
    assert.ok(seen[g][accent] / total > 0.15, 'the accent is clearly visible');
  });
});

test('fork sphere colours are stable over time (no flicker)', () => {
  const sc = S.make('twin'), a = { c: 0, a: 0 }, b = { c: 0, a: 0 };
  for (let i = 0; i < S.N; i += 7) { S.paint(sc, i, 0, a); S.paint(sc, i, 5000, b); assert.strictEqual(a.c, b.c); }
});

test('globe: every dot is land on the globe radius, grouped by continent, with no floating arcs', () => {
  const sc = S.make('globe');
  assert.strictEqual(sc.pts.length, S.N);
  assert.deepStrictEqual([...new Set(sc.grp)].sort(), [0, 1, 2]);
  sc.pts.forEach((p) => assert.ok(Math.abs(Math.hypot(p[0], p[1], p[2]) - S.GLOBE_RADIUS) < 1e-4, 'on the globe'));
});

test('globe paint: violet, lime and gold by continent, steady over time and in range', () => {
  const sc = S.make('globe'), a = {}, b = {};
  const colour = [S.VIOLET, S.LIME, S.GOLD];
  for (let i = 0; i < S.N; i++) {
    S.paint(sc, i, 0, a);
    S.paint(sc, i, 5000, b);
    assert.strictEqual(a.c, colour[sc.grp[i]]);
    assert.strictEqual(b.c, a.c, 'no twinkle or pulse');
    assert.strictEqual(b.a, a.a);
    assert.ok(a.a > 0 && a.a <= 1);
  }
});

test('globe opacities keep the land clearly above the ocean and the far side almost invisible', () => {
  const G = global.window.TerminalGlobe;
  assert.ok(G.SEA_ALPHA <= 0.6 * S.GLOBE_ALPHA, 'near ocean is at most 60% as opaque as land');
  assert.ok(G.SEA_ALPHA >= 0.3 * S.GLOBE_ALPHA, 'near ocean stays visible enough to close the sphere');
  assert.ok(G.SEA_BACK_ALPHA <= 0.1 && G.BACK_ALPHA <= 0.1, 'the far side stays almost invisible');
  assert.ok(G.SEA_BACK_ALPHA < G.SEA_ALPHA);
});

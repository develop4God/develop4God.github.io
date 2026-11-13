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

test('align keeps the same point set (a permutation) and never loses metadata pairing', () => {
  const a = S.make('twin'), b = S.make('pipeline');
  const aligned = S.align(a, b);
  assert.strictEqual(aligned.id, 'pipeline');
  const key = (sc, i) => sc.pts[i].join(',') + '|' + sc.grp[i] + '|' + sc.seed[i];
  const before = Array.from({ length: S.N }, (_, i) => key(b, i)).sort();
  const after = Array.from({ length: S.N }, (_, i) => key(aligned, i)).sort();
  assert.deepStrictEqual(after, before);
});

test('align shortens total travel compared with the unaligned pairing (no tornado)', () => {
  const a = S.make('cloud'), b = S.make('twin');
  const travel = (x, y) => x.pts.reduce((s, p, i) => s + Math.hypot(p[0] - y.pts[i][0], p[1] - y.pts[i][1], p[2] - y.pts[i][2]), 0);
  assert.ok(travel(a, S.align(a, b)) < travel(a, b) * 0.8);
});

test('alignChain aligns each scene to its predecessor and returns the same length', () => {
  const chain = S.alignChain([S.make('twin'), S.make('pipeline'), S.make('lattice')]);
  assert.strictEqual(chain.length, 3);
  assert.deepStrictEqual(chain.map((s) => s.id), ['twin', 'pipeline', 'lattice']);
  assert.deepStrictEqual(S.alignChain([]), []);
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

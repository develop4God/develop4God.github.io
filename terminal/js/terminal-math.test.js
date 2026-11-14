const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'terminal-math.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const M = global.window.TerminalMath;

test('clamp bounds values and passes through in-range ones', () => {
  assert.strictEqual(M.clamp(-5, 0, 1), 0);
  assert.strictEqual(M.clamp(9, 0, 1), 1);
  assert.strictEqual(M.clamp(0.4, 0, 1), 0.4);
});

test('ease is monotonic with fixed endpoints and midpoint', () => {
  assert.strictEqual(M.ease(0), 0);
  assert.strictEqual(M.ease(1), 1);
  assert.strictEqual(M.ease(0.5), 0.5);
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const v = M.ease(i / 20);
    assert.ok(v >= prev);
    prev = v;
  }
});

test('rng is deterministic per seed, differs across seeds, stays in [0,1)', () => {
  const a = M.rng(7), b = M.rng(7), c = M.rng(8);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()], seqC = [c(), c(), c()];
  assert.deepStrictEqual(seqA, seqB);
  assert.notDeepStrictEqual(seqA, seqC);
  seqA.concat(seqC).forEach((v) => assert.ok(v >= 0 && v < 1));
});

test('segment maps progress to scene segment and clamps out-of-range input', () => {
  assert.deepStrictEqual(M.segment(0, 3), { a: 0, lt: 0, active: 0 });
  assert.deepStrictEqual(M.segment(0.25, 3), { a: 0, lt: 0.5, active: 1 });
  assert.deepStrictEqual(M.segment(1, 3), { a: 1, lt: 1, active: 2 });
  assert.deepStrictEqual(M.segment(-4, 3), M.segment(0, 3));
  assert.deepStrictEqual(M.segment(7, 3), M.segment(1, 3));
});

test('segment with fewer than two scenes never morphs', () => {
  assert.deepStrictEqual(M.segment(0.9, 1), { a: 0, lt: 0, active: 0 });
  assert.deepStrictEqual(M.segment(0.9, 0), { a: 0, lt: 0, active: 0 });
});

test('stepToward moves at a fixed speed in units per second, never overshoots, and ignores bad dt', () => {
  assert.strictEqual(M.stepToward(0, 1, 500, 1), 0.5);
  assert.strictEqual(M.stepToward(0.9, 1, 500, 1), 1);
  assert.strictEqual(M.stepToward(1, 0, 250, 1), 0.75);
  assert.strictEqual(M.stepToward(0.3, 0.3, 500, 1), 0.3);
  assert.strictEqual(M.stepToward(0, 1, -50, 1), 0);
});

test('nextIndex advances, loops when asked, and stops at the end otherwise', () => {
  assert.strictEqual(M.nextIndex(0, 3, false), 1);
  assert.strictEqual(M.nextIndex(2, 3, true), 0);
  assert.strictEqual(M.nextIndex(2, 3, false), -1);
  assert.strictEqual(M.nextIndex(0, 1, true), -1);
  assert.strictEqual(M.nextIndex(0, 0, true), -1);
});

test('smooth is a clamped smoothstep: 0 before, 1 after, 0.5 at the middle', () => {
  assert.strictEqual(M.smooth(0.2, 0.8, 0), 0);
  assert.strictEqual(M.smooth(0.2, 0.8, 1), 1);
  assert.ok(Math.abs(M.smooth(0.2, 0.8, 0.5) - 0.5) < 1e-9);
  assert.strictEqual(M.smooth(0.5, 0.5, 0.4), 0);
  assert.strictEqual(M.smooth(0.5, 0.5, 0.6), 1);
});

test('project: centre point is unscaled; nearer points are larger than farther ones', () => {
  const out = {};
  const rot = M.rotation(0, 0);
  M.project(0, 0, 0, rot, out);
  assert.strictEqual(out.x, 0);
  assert.strictEqual(out.y, 0);
  assert.ok(Math.abs(out.f - 1) < 1e-9);
  const near = M.project(0, 0, -1, rot, {}).f;
  const far = M.project(0, 0, 1, rot, {}).f;
  assert.ok(near > far);
  assert.ok(out.d >= 0 && out.d <= 1);
});

test('parseStat handles suffixes, grouping, decimals, and rejects non-numeric text', () => {
  assert.deepStrictEqual(M.parseStat('22K+'), { prefix: '', value: 22, decimals: 0, grouped: false, suffix: 'K+' });
  assert.deepStrictEqual(M.parseStat('7,900+'), { prefix: '', value: 7900, decimals: 0, grouped: true, suffix: '+' });
  assert.deepStrictEqual(M.parseStat('4.9 ★'), { prefix: '', value: 4.9, decimals: 1, grouped: false, suffix: ' ★' });
  assert.strictEqual(M.parseStat('—'), null);
  assert.strictEqual(M.parseStat(''), null);
  assert.strictEqual(M.parseStat(null), null);
});

test('formatStat round-trips the final value and keeps the shape mid-animation', () => {
  ['22K+', '7,900+', '4.9 ★', '100+'].forEach((s) => {
    const p = M.parseStat(s);
    assert.strictEqual(M.formatStat(p.value, p), s);
  });
  assert.strictEqual(M.formatStat(3950, M.parseStat('7,900+')), '3,950+');
  assert.strictEqual(M.formatStat(0, M.parseStat('22K+')), '0K+');
});

test('wrapPi folds any angle into [-PI, PI] and keeps whole turns equal', () => {
  assert.strictEqual(M.wrapPi(0), 0);
  [0.3, -0.3, 3, -3].forEach((a) => assert.ok(Math.abs(M.wrapPi(a) - a) < 1e-12));
  [7, -7, 100, 1e6, -1e6].forEach((a) => {
    const w = M.wrapPi(a);
    assert.ok(Math.abs(w) <= Math.PI + 1e-9);
    assert.ok(Math.abs(Math.sin(w) - Math.sin(a)) < 1e-6 && Math.abs(Math.cos(w) - Math.cos(a)) < 1e-6);
  });
});

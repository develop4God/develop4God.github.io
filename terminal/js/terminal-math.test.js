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

test('pinProgress reaches 1 at 85% of travel and survives zero travel', () => {
  assert.strictEqual(M.pinProgress(56, 56, 1000), 0);
  assert.strictEqual(M.pinProgress(56, 56 - 850, 1000), 1);
  assert.strictEqual(M.pinProgress(56, 56 + 300, 1000), 0);
  assert.strictEqual(M.pinProgress(56, -5000, 0), 1);
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

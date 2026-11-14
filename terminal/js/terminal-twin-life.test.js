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
load('terminal-spin.js');
load('terminal-twin-life.js');
const T = global.window.TerminalTwinLife;

test('twinSettle: full only while the twin scene is settled, never mid-morph or without a twin scene', () => {
  assert.strictEqual(T.twinSettle(0, true, false), 1);
  assert.strictEqual(T.twinSettle(1, false, true), 1);
  assert.strictEqual(T.twinSettle(0.5, true, true), 0);
  assert.strictEqual(T.twinSettle(0, false, false), 0);
  assert.strictEqual(T.twinSettle(1, true, false), 0);
  assert.ok(T.twinSettle(0.07, true, false) > 0 && T.twinSettle(0.07, true, false) < 1);
});

test('twinMotion: no movement at all when the scene is not settled', () => {
  [0, 1].forEach((g) => {
    const m = T.twinMotion(12345, g, 0, 1);
    assert.deepStrictEqual([m.bob, m.scale, m.glow], [0, 1, 0]);
  });
});

test('twinMotion: bounded and finite when settled and idle', () => {
  for (let t = 0; t < 20000; t += 137) {
    [0, 1].forEach((g) => {
      const m = T.twinMotion(t, g, 1, 0);
      assert.ok(Number.isFinite(m.bob) && Math.abs(m.bob) <= 0.06);
      assert.ok(m.scale > 0.9 && m.scale < 1.1);
    });
  }
});

test('twinMotion: a hinted sphere grows and glows more than an idle one', () => {
  const idle = T.twinMotion(1000, 0, 1, 0), hot = T.twinMotion(1000, 0, 1, 1);
  assert.ok(hot.scale > idle.scale + 0.1);
  assert.ok(hot.glow > idle.glow && hot.glow === 1);
});

test('twinMotion fills a caller-owned object and returns it', () => {
  const out = {};
  assert.strictEqual(T.twinMotion(1000, 0, 1, 0.5, out), out);
  assert.deepStrictEqual(T.twinMotion(1000, 0, 1, 0.5), out);
});

test('twinSpin: turns at the shared TerminalSpin rate, from a different start for each sphere', () => {
  const S = global.window.TerminalSpin;
  const a = T.twinSpin(1000, 0), b = T.twinSpin(2000, 0);
  assert.ok(Math.abs(b.angle - a.angle - S.RATE * 1000) < 1e-9);
  assert.notStrictEqual(T.twinSpin(1000, 0).angle, T.twinSpin(1000, 1).angle);
});

test('twinSpin: never gated by anything else, always finite, and cos and sin match the angle; fills a caller-owned object', () => {
  const out = {};
  for (let t = 0; t < 60000; t += 997) {
    [0, 1].forEach((g) => {
      const s = T.twinSpin(t, g, out);
      assert.strictEqual(s, out);
      assert.ok(Number.isFinite(s.angle) && Math.abs(s.angle) <= Math.PI + 1e-9);
      assert.ok(Math.abs(s.cos - Math.cos(s.angle)) < 1e-12 && Math.abs(s.sin - Math.sin(s.angle)) < 1e-12);
    });
  }
});

test('spinPoint: turns a point about its sphere centre, keeps its height and its distance from the axis', () => {
  const out = { x: 0, y: 0, z: 0 };
  const none = { cos: 1, sin: 0 }, quarter = { cos: 0, sin: 1 };
  T.spinPoint(1.2, 0.3, 0.1, 0.9, none, out);
  assert.deepStrictEqual([out.x, out.y, out.z], [1.2, 0.3, 0.1]);
  T.spinPoint(0.9, 0.5, 0, 0.9, quarter, out);
  assert.ok(Math.abs(out.x - 0.9) < 1e-12 && Math.abs(out.y - 0.5) < 1e-12 && Math.abs(out.z) < 1e-12, 'a point on the axis stays put');
  T.spinPoint(1.5, 0.2, 0.3, 0.9, quarter, out);
  assert.ok(Math.abs(Math.hypot(out.x - 0.9, out.z) - Math.hypot(0.6, 0.3)) < 1e-12);
  assert.strictEqual(out.y, 0.2);
  // a quarter turn takes (dx, z) to (z, -dx): the same direction the camera yaw turns the globe
  assert.ok(Math.abs(out.x - (0.9 + 0.3)) < 1e-12 && Math.abs(out.z - -0.6) < 1e-12);
});

test('spinPoint turns points the same way the camera yaw turns the globe (same handedness as TerminalMath.project)', () => {
  const M = global.window.TerminalMath, out = { x: 0, y: 0, z: 0 }, pr = {};
  [-2.5, -0.7, 0.4, 1.9, 3].forEach((a) => {
    T.spinPoint(1.4, 0.2, 0.6, 0, { cos: Math.cos(a), sin: Math.sin(a) }, out);
    M.project(1.4, 0.2, 0.6, M.rotation(a, 0), pr);
    assert.ok(Math.abs(out.z - pr.z) < 1e-12, `angle ${a}`);
    assert.ok(Math.abs(out.x - 1.4 * Math.cos(a) - 0.6 * Math.sin(a)) < 1e-12);
  });
});

test('spinPoint stays continuous across the wrap: an angle of PI and of -PI give the same point', () => {
  const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  T.spinPoint(1.5, 0.2, 0.3, 0.9, { cos: Math.cos(Math.PI), sin: Math.sin(Math.PI) }, a);
  T.spinPoint(1.5, 0.2, 0.3, 0.9, { cos: Math.cos(-Math.PI), sin: Math.sin(-Math.PI) }, b);
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9);
});

test('stepHint: eases toward the target without overshooting, and holds at dt = 0', () => {
  assert.strictEqual(T.stepHint(0.3, 1, 0), 0.3);
  let v = 0;
  for (let i = 0; i < 200; i++) { const n = T.stepHint(v, 1, 16); assert.ok(n >= v && n <= 1); v = n; }
  assert.ok(v > 0.99);
  assert.strictEqual(T.stepHint(1, 0, 1e6), 0);
  assert.strictEqual(T.stepHint(0.5, 0.5, 16), 0.5);
});

test('idleHint: a gentle alternating pulse, between 0 and 0.3, with the two spheres out of phase', () => {
  let a0 = 1, a1 = 1, hi = 0;
  for (let t = 0; t < 8000; t += 50) {
    const x = T.idleHint(t, 0), y = T.idleHint(t, 1);
    assert.ok(x >= 0 && x <= 0.3 && y >= 0 && y <= 0.3);
    a0 = Math.min(a0, x); a1 = Math.min(a1, y); hi = Math.max(hi, x, y);
  }
  assert.ok(hi > 0.25 && a0 < 0.05 && a1 < 0.05);
  assert.notStrictEqual(T.idleHint(700, 0), T.idleHint(700, 1));
});

test('hintFor: maps a door path to its sphere and ignores unknown doors', () => {
  assert.strictEqual(T.hintFor('hire'), 0);
  assert.strictEqual(T.hintFor('ministry'), 1);
  assert.strictEqual(T.hintFor('min'), -1);
  assert.strictEqual(T.hintFor('nope'), -1);
  assert.strictEqual(T.hintFor(undefined), -1);
  assert.strictEqual(T.hintFor('__proto__'), -1);
});

test('twinPoint: identity at rest, scales about the sphere centre, and a weight of 0 leaves the point alone', () => {
  const rest = { bob: 0, scale: 1, glow: 0 }, out = { x: 0, y: 0, z: 0 };
  T.twinPoint(1.2, 0.3, 0.1, 0.9, rest, 1, out);
  assert.deepStrictEqual([out.x, out.y, out.z], [1.2, 0.3, 0.1]);
  const breathing = { bob: 0.04, scale: 1.1, glow: 0.5 };
  T.twinPoint(1.2, 0.3, 0.1, 0.9, breathing, 0, out);
  assert.deepStrictEqual([out.x, out.y, out.z], [1.2, 0.3, 0.1]);
  T.twinPoint(0.9, 0, 0, 0.9, breathing, 1, out);
  assert.ok(Math.abs(out.x - 0.9) < 1e-9 && Math.abs(out.y - breathing.bob) < 1e-9, 'the centre only bobs');
  T.twinPoint(1.7, 0, 0, 0.9, breathing, 1, out);
  assert.ok(Math.abs(Math.hypot(out.x - 0.9, out.z) - 0.8 * 1.1) < 1e-9, 'scaled about the centre');
});

test('twinPoint: a half weight lands halfway between the plain and the full point', () => {
  const m = { bob: 0.04, scale: 1.1, glow: 0 };
  const full = { x: 0, y: 0, z: 0 }, half = { x: 0, y: 0, z: 0 };
  T.twinPoint(1.5, 0.2, 0.3, -0.9, m, 1, full);
  T.twinPoint(1.5, 0.2, 0.3, -0.9, m, 0.5, half);
  assert.ok(Math.abs(half.x - (1.5 + full.x) / 2) < 1e-9 && Math.abs(half.y - (0.2 + full.y) / 2) < 1e-9 && Math.abs(half.z - (0.3 + full.z) / 2) < 1e-9);
});

test('hotSphere: a hovered door wins over a focused one; none means -1', () => {
  assert.strictEqual(T.hotSphere([]), -1);
  assert.strictEqual(T.hotSphere([{ sphere: 0, hover: false, focus: false }, { sphere: 1, hover: false, focus: false }]), -1);
  assert.strictEqual(T.hotSphere([{ sphere: 0, hover: false, focus: false }, { sphere: 1, hover: true, focus: false }]), 1);
  assert.strictEqual(T.hotSphere([{ sphere: 0, hover: false, focus: true }, { sphere: 1, hover: true, focus: false }]), 1, 'a hovered door beats a focused one');
  assert.strictEqual(T.hotSphere([{ sphere: 0, hover: false, focus: true }, { sphere: 1, hover: false, focus: false }]), 0);
  assert.strictEqual(T.hotSphere([{ sphere: -1, hover: true, focus: false }]), -1);
});

test('isMouse: mouse and pen hover (and fire a leave); touch taps never do', () => {
  assert.strictEqual(T.isMouse('mouse'), true);
  assert.strictEqual(T.isMouse('pen'), true);
  assert.strictEqual(T.isMouse('touch'), false);
  assert.strictEqual(T.isMouse(undefined), false);
});

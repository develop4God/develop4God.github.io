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
load('terminal-arcs.js');
const A = global.window.TerminalArcs;

const len = (p) => Math.hypot(p.x, p.y, p.z);

test('surface puts a point on the sphere of the given radius', () => {
  [[0, 0], [90, 45], [-120, -60], [180, 89]].forEach(([lon, lat]) => {
    assert.ok(Math.abs(len(A.surface(lon, lat, 1.25, {})) - 1.25) < 1e-9);
  });
});

test('surface: the north pole is straight up (y grows downward) and the equator has y 0', () => {
  assert.ok(A.surface(10, 90, 1, {}).y < -0.999);
  assert.ok(Math.abs(A.surface(10, 0, 1, {}).y) < 1e-9);
});

test('arcPoint starts and ends on the surface at the link endpoints', () => {
  A.LINKS.forEach((l) => {
    const a = A.arcPoint(l, 0, 0.3, 1, {}), b = A.arcPoint(l, 1, 0.3, 1, {});
    const sa = A.surface(l[0], l[1], 1, {}), sb = A.surface(l[2], l[3], 1, {});
    assert.ok(Math.hypot(a.x - sa.x, a.y - sa.y, a.z - sa.z) < 1e-6);
    assert.ok(Math.hypot(b.x - sb.x, b.y - sb.y, b.z - sb.z) < 1e-6);
  });
});

test('arcPoint lifts the middle above the surface and stays finite', () => {
  A.LINKS.forEach((l) => {
    const mid = A.arcPoint(l, 0.5, 0.3, 1, {});
    assert.ok(len(mid) > 1.05 && len(mid) <= 1.31);
    for (let s = 0; s <= 1.0001; s += 0.1) {
      const p = A.arcPoint(l, s, 0.3, 1, {});
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    }
  });
});

test('arcPoint handles a zero-length link (same endpoints) without NaN', () => {
  const p = A.arcPoint([10, 20, 10, 20], 0.5, 0.3, 1, {});
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
});

test('arcPoint with no lift stays on the sphere', () => {
  const p = A.arcPoint(A.LINKS[0], 0.5, 0, 1.25, {});
  assert.ok(Math.abs(len(p) - 1.25) < 1e-9);
});

test('pulse is always within 0..1 and peaks where the pulse head is', () => {
  for (let t = 0; t < 20000; t += 137) {
    for (let a = 0; a < A.LINKS.length; a++) {
      for (let f = 0; f <= 1; f += 0.05) {
        const b = A.pulse(f, a, t);
        assert.ok(b >= 0 && b <= 1, `pulse ${b}`);
      }
    }
  }
  let best = 0;
  for (let f = 0; f <= 1; f += 0.01) best = Math.max(best, A.pulse(f, 0, 1000));
  assert.ok(best > 0.9);
});

test('pulse: different arcs are out of phase and the head travels forward', () => {
  const head = (a, t) => { let bf = 0, bb = -1; for (let f = 0; f <= 1; f += 0.01) { const b = A.pulse(f, a, t); if (b > bb) { bb = b; bf = f; } } return bf; };
  assert.notStrictEqual(head(0, 1000), head(1, 1000));
  // At t=2000 the head of arc 0 is mid-arc; a little later it has moved toward the target.
  assert.ok(head(0, 2100) > head(0, 2000));
});

test('LINKS are well-formed: lon in [-180,180], lat in [-90,90], no zero-length link', () => {
  assert.ok(A.LINKS.length >= 6);
  A.LINKS.forEach((l) => {
    assert.strictEqual(l.length, 4);
    assert.ok(Math.abs(l[0]) <= 180 && Math.abs(l[2]) <= 180 && Math.abs(l[1]) <= 90 && Math.abs(l[3]) <= 90);
    assert.ok(l[0] !== l[2] || l[1] !== l[3]);
    const a = A.surface(l[0], l[1], 1, {}), b = A.surface(l[2], l[3], 1, {});
    assert.ok(Math.acos(a.x * b.x + a.y * b.y + a.z * b.z) < Math.PI - 0.1, 'not antipodal');
  });
});

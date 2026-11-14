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
const G = global.window.TerminalGlobe;
const M = global.window.TerminalMath;

const RAD = Math.PI / 180;
const mask = Buffer.from(global.window.TerminalWorldMask, 'base64');

// Inverse of surface(): the mask cell under a point of the globe.
function isLand(x, y, z) {
  const r = Math.hypot(x, y, z);
  const lon = Math.atan2(x, -z) / RAD - G.LON_OFFSET;
  const lat = Math.asin(-y / r) / RAD;
  const wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
  const cx = Math.min(179, Math.floor((wrapped + 180) / 2)), cy = Math.min(89, Math.floor((90 - lat) / 2));
  const bit = cy * 180 + cx;
  return ((mask[bit >> 3] >> (bit & 7)) & 1) === 1;
}

test('surface puts the north pole at -y and keeps the requested radius', () => {
  const p = {};
  G.surface(0, 90, 2, p);
  assert.ok(Math.abs(p.y + 2) < 1e-9 && Math.abs(p.x) < 1e-9 && Math.abs(p.z) < 1e-9);
  G.surface(-G.LON_OFFSET, 0, 1.25, p);
  assert.ok(Math.abs(p.z + 1.25) < 1e-9, 'the longitude that cancels the map offset faces the camera, which sits at -z');
  assert.ok(Math.abs(Math.hypot(p.x, p.y, p.z) - 1.25) < 1e-9);
});

test('continent splits the longitudes into three colour bands, boundaries included', () => {
  assert.strictEqual(G.continent(-180), 0);
  assert.strictEqual(G.continent(-100), 0);
  assert.strictEqual(G.continent(-30.01), 0);
  assert.strictEqual(G.continent(-30), 1);
  assert.strictEqual(G.continent(10), 1);
  assert.strictEqual(G.continent(54.99), 1);
  assert.strictEqual(G.continent(55), 2);
  assert.strictEqual(G.continent(120), 2);
  assert.strictEqual(G.continent(180), 2);
});

test('land returns count points on the globe radius, only on land, deterministic, with all three classes', () => {
  const a = G.land(1800, 0, 1.25), b = G.land(1800, 0, 1.25);
  assert.strictEqual(a.pts.length, 1800 * 3);
  assert.strictEqual(a.cls.length, 1800);
  assert.deepStrictEqual(Array.from(a.pts.slice(0, 60)), Array.from(b.pts.slice(0, 60)));
  for (let i = 0; i < 1800; i++) {
    const x = a.pts[i * 3], y = a.pts[i * 3 + 1], z = a.pts[i * 3 + 2];
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1.25) < 1e-4, 'radius');
    assert.ok(isLand(x, y, z), 'on land ' + i);
    assert.ok(a.cls[i] <= 2);
  }
  assert.deepStrictEqual([...new Set(a.cls)].sort(), [0, 1, 2]);
});

test('land slices line up: the extras start exactly where the scene dots end, with no overlap', () => {
  const whole = G.land(30, 0, 1), head = G.land(10, 0, 1), tail = G.land(20, 10, 1);
  assert.deepStrictEqual(Array.from(head.pts), Array.from(whole.pts.slice(0, 30)));
  assert.deepStrictEqual(Array.from(tail.pts), Array.from(whole.pts.slice(30)));
});

test('land rejects a request beyond the cells of the mask or invalid arguments', () => {
  assert.throws(() => G.land(1e6, 0, 1), /fewer land cells/i);
  assert.throws(() => G.land(10, G.landCellCount() - 5, 1), /fewer land cells/i);
  assert.doesNotThrow(() => G.land(5, G.landCellCount() - 5, 1));
  assert.throws(() => G.land(-1, 0, 1), /count/i);
  assert.throws(() => G.land(5, -1, 1), /count|from/i);
  assert.strictEqual(G.land(0, 0, 1).cls.length, 0);
});

test('the scene dots and the extra land dots fit inside the land of the mask', () => {
  assert.doesNotThrow(() => G.land(1800 + G.LAND_EXTRA, 0, 1));
});

test('sea returns dots on the radius that never fall on land, deterministically', () => {
  const a = G.sea(3000, 1.25), b = G.sea(3000, 1.25);
  assert.strictEqual(a.length, 3000 * 3);
  assert.deepStrictEqual(Array.from(a.slice(0, 60)), Array.from(b.slice(0, 60)));
  for (let i = 0; i < 3000; i++) {
    assert.ok(Math.abs(Math.hypot(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]) - 1.25) < 1e-4);
    assert.ok(!isLand(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]), 'sea dot ' + i + ' is on land');
  }
});

test('sea handles zero and rejects a negative count', () => {
  assert.strictEqual(G.sea(0, 1).length, 0);
  assert.throws(() => G.sea(-5, 1), /count/i);
});

test('east is on the right when the globe faces the camera: longitude grows with screen x on the near side', () => {
  const rot = M.rotation(0, 0), a = {}, b = {}, q = {};
  G.surface(-G.LON_OFFSET - 10, 0, 1.25, a);
  G.surface(-G.LON_OFFSET + 10, 0, 1.25, b);
  M.project(a.x, a.y, a.z, rot, q);
  const west = q.x;
  M.project(b.x, b.y, b.z, rot, q);
  assert.ok(q.x > west, 'a point further east sits further right');
  assert.ok(a.z < 0 && b.z < 0, 'both are on the near side');
});

test('limbRadius is the on-screen edge of the sphere under the shared camera, and rejects a radius at the camera', () => {
  const r = 1.25, d = M.CAMERA;
  assert.ok(Math.abs(G.limbRadius(r) - (r * d) / Math.sqrt(d * d - r * r)) < 1e-9);
  assert.ok(G.limbRadius(r) > r);
  // The farthest-left dot of a sphere projected with the real camera sits on that radius.
  const rot = M.rotation(0, 0), q = {};
  let best = 0;
  for (let a = 0; a < 6.3; a += 0.01) { M.project(Math.cos(a) * r, 0, Math.sin(a) * r, rot, q); best = Math.max(best, Math.abs(q.x)); }
  assert.ok(Math.abs(best - G.limbRadius(r)) < 0.01, `limb ${best} vs ${G.limbRadius(r)}`);
  assert.throws(() => G.limbRadius(d), /range|radius/i);
  // With a far camera the silhouette is the sphere's own radius, and a camera inside the sphere is rejected.
  assert.ok(Math.abs(G.limbRadius(r, 1000) - r) < 1e-3);
  assert.throws(() => G.limbRadius(r, r), /range|radius/i);
});

test('globeWeight is 1 on the globe, 0 elsewhere, and eases across a morph in either direction', () => {
  assert.strictEqual(G.globeWeight('globe', 'languages', 0), 1);
  assert.strictEqual(G.globeWeight('globe', 'languages', 1), 0);
  assert.strictEqual(G.globeWeight('globe', 'languages', 0.25), 0.75);
  assert.strictEqual(G.globeWeight('twin', 'globe', 0.25), 0.25);
  assert.strictEqual(G.globeWeight('twin', 'languages', 0.5), 0);
  assert.strictEqual(G.globeWeight('globe', 'globe', 0.5), 1);
});

test('landCellCount matches the set bits of the mask', () => {
  let n = 0;
  for (let b = 0; b < 180 * 90; b++) if ((mask[b >> 3] >> (b & 7)) & 1) n++;
  assert.strictEqual(G.landCellCount(), n);
});

test('cameraFor eases the perspective amount, so the view changes smoothly across a morph', () => {
  const close = (a, b) => Math.abs(a - b) < 1e-9 * b;
  assert.ok(close(G.cameraFor(0), M.CAMERA));
  assert.ok(close(G.cameraFor(1), G.ORTHO_CAMERA));
  assert.ok(close(G.cameraFor(-3), M.CAMERA), 'below 0 clamps');
  assert.ok(close(G.cameraFor(9), G.ORTHO_CAMERA), 'above 1 clamps');
  const amount = (w) => 1 / G.cameraFor(w), a0 = amount(0), a1 = amount(1);
  let prev = a0;
  for (let w = 0.1; w <= 1.0001; w += 0.1) {
    const a = amount(w);
    assert.ok(a < prev, 'perspective only decreases');
    assert.ok(Math.abs((prev - a) - (a0 - a1) / 10) < 1e-9, 'in equal steps');
    prev = a;
  }
});

test('landRadius: near dots are bigger, far dots are small, and depth beyond the sphere does not grow a dot', () => {
  const near = G.landRadius(-1.25, 1.25), mid = G.landRadius(-0.6, 1.25), far = G.landRadius(0.8, 1.25);
  assert.ok(near > mid && mid > far, 'nearer is bigger');
  assert.ok(Math.abs(near - (G.DOT.LAND + G.DOT.LAND_NEAR)) < 1e-12, 'the centre of the near side has the full near size');
  assert.strictEqual(far, G.DOT.LAND_FAR);
  assert.ok(G.landRadius(-9, 1.25) <= G.DOT.LAND + G.DOT.LAND_NEAR + 1e-12);
  assert.strictEqual(G.landRadius(G.BACK_Z, 1.25), G.DOT.LAND, 'exactly at the boundary is still the near side, zero depth');
});

test('landAlpha: lit near dots, almost invisible far dots, scaled by the fade', () => {
  assert.strictEqual(G.landAlpha(false, 0.95, 1), 0.95);
  assert.ok(Math.abs(G.landAlpha(true, 0.95, 1) - 0.95 * G.BACK_ALPHA) < 1e-12);
  assert.strictEqual(G.landAlpha(false, 0.95, 0), 0);
  assert.ok(Math.abs(G.landAlpha(false, 1, 0.5) - 0.5) < 1e-12);
});

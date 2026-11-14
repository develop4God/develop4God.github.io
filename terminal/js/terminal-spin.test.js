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
const S = global.window.TerminalSpin;
const TAU = Math.PI * 2;

// Smallest signed difference between two angles.
function gap(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

test('angle: starts at the phase and turns at RATE radians per millisecond', () => {
  assert.strictEqual(S.angle(0), 0);
  assert.ok(Math.abs(S.angle(1000, 0) - S.RATE * 1000) < 1e-12);
  assert.ok(Math.abs(S.angle(0, 1.2) - 1.2) < 1e-12);
});

test('angle: always finite and within one half turn, even after a very long session', () => {
  [0, 1, 999, 1e5, 1e9, 1e12].forEach((t) => {
    [0, 1, -1, Math.PI, 7].forEach((ph) => {
      const a = S.angle(t, ph);
      assert.ok(Number.isFinite(a) && Math.abs(a) <= Math.PI + 1e-9, `t=${t} phase=${ph} -> ${a}`);
    });
  });
});

test('angle: stays continuous across the wrap (no jump when it passes half a turn)', () => {
  const dt = 16;
  for (let t = 0; t < 60000; t += dt) {
    assert.ok(Math.abs(gap(S.angle(t + dt, 0), S.angle(t, 0)) - S.RATE * dt) < 1e-9, `t=${t}`);
  }
});

test('angle: a phase offset shifts the spin without changing its speed', () => {
  [0.5, 2, -1, 3].forEach((ph) => {
    assert.ok(Math.abs(gap(S.angle(5000, ph), S.angle(5000, 0)) - gap(ph, 0)) < 1e-9, `phase ${ph}`);
  });
  assert.ok(Math.abs(gap(S.angle(6000, 2), S.angle(5000, 2)) - S.RATE * 1000) < 1e-9);
});

test('RATE and TILT are sane: a calm full turn takes 15 to 40 seconds and the tilt shows the top', () => {
  const seconds = TAU / (S.RATE * 1000);
  assert.ok(seconds > 15 && seconds < 40);
  assert.ok(S.TILT > 0 && S.TILT < Math.PI / 2);
});

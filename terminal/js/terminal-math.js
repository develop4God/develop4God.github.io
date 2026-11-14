// Pure helpers for the /terminal/ page: numeric math, 3D projection, scene/stat
// parsing. No DOM access, so every function is unit-testable under node --test.
(function (window) {
  'use strict';

  var TAU = Math.PI * 2;
  // Distance of the camera from the scene centre; shared so the globe's silhouette can be computed.
  var CAMERA = 3.4;

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  // Cubic ease in/out, input and output in 0..1.
  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Small deterministic PRNG (mulberry32) so scenes are identical on every load.
  function rng(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      var e = Math.imul(t ^ (t >>> 15), 1 | t);
      e = (e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ e;
      return ((e ^ (e >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Splits scroll progress (0..1) across `count` scenes.
  // Returns the segment index `a`, the local morph position `lt` (0..1) between
  // scene a and a+1, and the index of the scene that should be active.
  function segment(progress, count) {
    if (count < 2) return { a: 0, lt: 0, active: 0 };
    var seg = clamp(progress, 0, 1) * (count - 1);
    var a = Math.min(count - 2, Math.floor(seg));
    return { a: a, lt: seg - a, active: Math.round(seg) };
  }

  // Smoothstep window: 0 before a, 1 after b, eased in between.
  function smooth(a, b, x) {
    if (b <= a) return x < a ? 0 : 1;
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // Moves `value` toward `target` at `speed` units per second over `dtMs`
  // milliseconds, never overshooting. Negative dt is ignored.
  function stepToward(value, target, dtMs, speed) {
    var step = (Math.max(0, dtMs) / 1000) * speed;
    if (value < target) return Math.min(target, value + step);
    return Math.max(target, value - step);
  }

  // Index of the scene after `current`: wraps when `loop`, otherwise -1 at the end
  // (and -1 when there is nothing to advance to).
  function nextIndex(current, count, loop) {
    if (count < 2) return -1;
    if (current + 1 < count) return current + 1;
    return loop ? 0 : -1;
  }

  // Projects a 3D point with a precomputed rotation. Returns screen factors in
  // `out` to avoid per-point allocation: x, y (unscaled), f (perspective), d (depth 0..1), z.
  // `cam` is the camera distance (default CAMERA); a very large one makes the view orthographic.
  function project(x, y, z, rot, out, cam) {
    var c = cam || CAMERA;
    var x1 = x * rot.cy + z * rot.sy;
    var z1 = -x * rot.sy + z * rot.cy;
    var y1 = y * rot.cp - z1 * rot.sp;
    var z2 = y * rot.sp + z1 * rot.cp;
    var f = c / (c + z2);
    out.x = x1 * f;
    out.y = y1 * f;
    out.f = f;
    out.z = z2;
    out.d = clamp((z2 + 2) / 4, 0, 1);
    return out;
  }

  // Folds any angle into [-PI, PI]; whole turns do not change the direction it points.
  function wrapPi(a) {
    return a - TAU * Math.round(a / TAU);
  }

  function rotation(yaw, pitch) {
    return { cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch) };
  }

  // Parses a displayed statistic such as "22K+", "7,900+" or "4.9 ★".
  // Returns null when the text holds no number, so callers can skip animating it.
  function parseStat(text) {
    var m = /^([^\d]*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(String(text == null ? '' : text).trim());
    if (!m) return null;
    var raw = m[2];
    var decimals = raw.indexOf('.') >= 0 ? raw.split('.')[1].length : 0;
    return {
      prefix: m[1],
      value: parseFloat(raw.replace(/,/g, '')),
      decimals: decimals,
      grouped: raw.indexOf(',') >= 0,
      suffix: m[3]
    };
  }

  // Formats an in-flight value using the shape captured by parseStat.
  function formatStat(value, parsed) {
    var n = parsed.decimals ? value.toFixed(parsed.decimals) : String(Math.round(value));
    if (parsed.grouped) n = Number(n).toLocaleString('en-US', { maximumFractionDigits: parsed.decimals });
    return parsed.prefix + n + parsed.suffix;
  }

  window.TerminalMath = {
    TAU: TAU,
    wrapPi: wrapPi,
    clamp: clamp,
    ease: ease,
    rng: rng,
    segment: segment,
    smooth: smooth,
    stepToward: stepToward,
    nextIndex: nextIndex,
    CAMERA: CAMERA,
    project: project,
    rotation: rotation,
    parseStat: parseStat,
    formatStat: formatStat
  };
})(window);

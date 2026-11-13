// Pure helpers for the /terminal/ page: numeric math, 3D projection, scene/stat
// parsing. No DOM access, so every function is unit-testable under node --test.
(function (window) {
  'use strict';

  var TAU = Math.PI * 2;

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

  // Scroll progress through a pinned story. `top` is the pin's sticky offset,
  // `rectTop` the story's viewport top, `travel` the scrollable distance.
  // The last scene is reached at 85% so it holds before the pin releases.
  function pinProgress(top, rectTop, travel) {
    return clamp((top - rectTop) / Math.max(travel, 1) / 0.85, 0, 1);
  }

  // Projects a 3D point with a precomputed rotation. Returns screen factors in
  // `out` to avoid per-point allocation: x, y (unscaled), f (perspective), d (depth 0..1), z.
  function project(x, y, z, rot, out) {
    var x1 = x * rot.cy + z * rot.sy;
    var z1 = -x * rot.sy + z * rot.cy;
    var y1 = y * rot.cp - z1 * rot.sp;
    var z2 = y * rot.sp + z1 * rot.cp;
    var f = 3.4 / (3.4 + z2);
    out.x = x1 * f;
    out.y = y1 * f;
    out.f = f;
    out.z = z2;
    out.d = clamp((z2 + 2) / 4, 0, 1);
    return out;
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
    clamp: clamp,
    ease: ease,
    rng: rng,
    segment: segment,
    pinProgress: pinProgress,
    project: project,
    rotation: rotation,
    parseStat: parseStat,
    formatStat: formatStat
  };
})(window);

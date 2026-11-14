// Life for the two fork spheres (hire = left, ministry = right), so they never just sit
// there: they spin (the same spin as the globe) and breathe out of phase, take turns pulsing,
// and the sphere that matches the door under the pointer or focus grows and glows. Pure maths; the canvas
// applies the result to each sphere's points.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  var SPIN = window.TerminalSpin;
  // Door path (the data-path-link of each fork door) -> the sphere it stands for.
  var DOORS = { hire: 0, ministry: 1 };

  // 1 while the twin scene is settled, 0 mid-morph or when it is not on screen at all.
  function twinSettle(lt, aIsTwin, bIsTwin) {
    var out = aIsTwin ? 1 - M.ease(M.clamp(lt / 0.15, 0, 1)) : 0;
    var inn = bIsTwin ? M.ease(M.clamp((lt - 0.85) / 0.15, 0, 1)) : 0;
    return Math.max(out, inn);
  }

  // Vertical bob (world units), scale and glow (0..1) of sphere g at time t (ms). `settle` scales
  // everything, `hint` (0..1) is how hard the sphere is being asked about. The two spheres run half a
  // cycle apart. Fills `out` (a new object when omitted).
  function twinMotion(t, g, settle, hint, out) {
    var ph = g ? Math.PI : 0, o = out || {};
    // `+ 0` turns a negative zero (settle 0 times a negative sine) into 0.
    o.bob = settle * 0.05 * Math.sin(t * 0.0013 + ph * 0.5) + 0;
    o.scale = 1 + settle * (0.04 * Math.sin(t * 0.0011 + ph) + 0.12 * hint);
    o.glow = settle * hint;
    return o;
  }

  // The spin of sphere g at time t (ms): the same calm turn the globe uses, started half a turn apart
  // for the two spheres. It is never scaled down, because a part-turn would shrink or snap the sphere;
  // the canvas applies it in full to the end of each dot's flight that lies in the sphere.
  // Fills `out` (a new object when omitted) with the angle and its cos and sin.
  function twinSpin(t, g, out) {
    var o = out || {};
    o.angle = SPIN.angle(t, g ? Math.PI : 0);
    o.cos = Math.cos(o.angle);
    o.sin = Math.sin(o.angle);
    return o;
  }

  // Turns point (x, y, z) about the vertical axis of the sphere centred at cx by spin s ({ cos, sin }).
  // The result goes into `out` {x, y, z}.
  function spinPoint(x, y, z, cx, s, out) {
    var dx = x - cx;
    out.x = cx + dx * s.cos + z * s.sin;
    out.z = -dx * s.sin + z * s.cos;
    out.y = y;
    return out;
  }

  // Scales point (x, y, z) of the sphere centred at cx by motion m and bobs it, blended by weight w
  // (0 leaves it where it is, 1 is the full scale and bob). The result goes into `out` {x, y, z}.
  function twinPoint(x, y, z, cx, m, w, out) {
    var sc = 1 + (m.scale - 1) * w;
    out.x = cx + (x - cx) * sc;
    out.z = z * sc;
    out.y = y * sc + m.bob * w;
    return out;
  }

  // Eases a hint value toward its target without overshooting (dtMs frame time).
  function stepHint(cur, target, dtMs) {
    return cur + (target - cur) * Math.min(1, Math.max(0, dtMs) * 0.006);
  }

  // A gentle pulse (0..0.3) that passes between the spheres when nothing is being pointed at,
  // which is also all a touch screen ever sees.
  function idleHint(t, g) {
    return 0.3 * (0.5 + 0.5 * Math.sin(t * 0.002 + (g ? Math.PI : 0)));
  }

  // The sphere a door path stands for, or -1.
  function hintFor(door) {
    return Object.prototype.hasOwnProperty.call(DOORS, door) ? DOORS[door] : -1;
  }

  // The sphere a hovered door stands for, else a keyboard-focused one ({ sphere, hover, focus } each), or -1.
  function hotSphere(doors) {
    var i;
    for (i = 0; i < doors.length; i++) if (doors[i].hover && doors[i].sphere >= 0) return doors[i].sphere;
    for (i = 0; i < doors.length; i++) if (doors[i].focus && doors[i].sphere >= 0) return doors[i].sphere;
    return -1;
  }

  // A mouse or pen hovers and fires a matching pointerleave; a touch tap fires pointerenter without
  // one, so touch is ignored and cannot leave a sphere stuck.
  function isMouse(pointerType) {
    return pointerType === 'mouse' || pointerType === 'pen';
  }

  window.TerminalTwinLife = { twinPoint: twinPoint, hotSphere: hotSphere, isMouse: isMouse, twinSettle: twinSettle, twinMotion: twinMotion, twinSpin: twinSpin, spinPoint: spinPoint, stepHint: stepHint, idleHint: idleHint, hintFor: hintFor };
})(window);

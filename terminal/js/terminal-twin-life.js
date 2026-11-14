// Life for the two fork spheres (hire = left, ministry = right), so they never just sit
// there: they sway and breathe out of phase, take turns pulsing, and the sphere that matches
// the door under the pointer or focus grows, glows and sways harder. Pure maths; the canvas
// applies the result to each sphere's points.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  // Door path (the data-path-link of each fork door) -> the sphere it stands for.
  var DOORS = { hire: 0, ministry: 1 };

  // 1 while the twin scene is settled, 0 mid-morph or when it is not on screen at all.
  function twinSettle(lt, aIsTwin, bIsTwin) {
    var out = aIsTwin ? 1 - M.ease(M.clamp(lt / 0.15, 0, 1)) : 0;
    var inn = bIsTwin ? M.ease(M.clamp((lt - 0.85) / 0.15, 0, 1)) : 0;
    return Math.max(out, inn);
  }

  // Sway angle about the vertical axis (rad), vertical bob (world units), scale and glow (0..1)
  // of sphere g at time t (ms). `settle` scales everything, `hint` (0..1) is how hard the sphere
  // is being asked about. The two spheres run half a cycle apart.
  // Fills `out` (a new object when omitted) and also stores cos/sin of the angle for twinPoint.
  function twinMotion(t, g, settle, hint, out) {
    var ph = g ? Math.PI : 0, o = out || {};
    // `+ 0` turns a negative zero (settle 0 times a negative sine) into 0.
    o.angle = settle * (0.35 + 0.35 * hint) * Math.sin(t * 0.0009 + ph) + 0;
    o.bob = settle * 0.05 * Math.sin(t * 0.0013 + ph * 0.5) + 0;
    o.scale = 1 + settle * (0.04 * Math.sin(t * 0.0011 + ph) + 0.12 * hint);
    o.glow = settle * hint;
    o.cos = Math.cos(o.angle);
    o.sin = Math.sin(o.angle);
    return o;
  }

  // Moves point (x, y, z) of the sphere centred at cx by motion m, blended by weight w (0 leaves
  // it where it is, 1 is the full sway, scale and bob). The result goes into `out` {x, y, z}.
  function twinPoint(x, y, z, cx, m, w, out) {
    var dx = x - cx;
    out.x = x + (cx + (dx * m.cos + z * m.sin) * m.scale - x) * w;
    out.z = z + ((-dx * m.sin + z * m.cos) * m.scale - z) * w;
    out.y = y + (y * m.scale + m.bob - y) * w;
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

  window.TerminalTwinLife = { twinPoint: twinPoint, hotSphere: hotSphere, isMouse: isMouse, twinSettle: twinSettle, twinMotion: twinMotion, stepHint: stepHint, idleHint: idleHint, hintFor: hintFor };
})(window);

// Great-circle arcs between readers' regions for the globe scene, plus the shared
// lon/lat -> globe mapping so land dots and arcs always agree. Pure maths, no DOM.
// y grows downward on screen, so the north pole is at -y.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  var RAD = Math.PI / 180;
  // The land map is turned so the Americas face the viewer first.
  var LON_OFFSET = -70;
  // Each arc: [lonFrom, latFrom, lonTo, latTo] between regions where the ministry is read.
  var LINKS = [
    [-99, 19, -3, 40],     // Mexico City - Madrid
    [-74, 5, -46, -23],    // Bogota - Sao Paulo
    [-80, 26, 8, 6],       // Miami - Lagos
    [-3, 40, 37, -1],      // Madrid - Nairobi
    [-46, -23, 121, 14],   // Sao Paulo - Manila
    [-99, 19, 127, 37],    // Mexico City - Seoul
    [8, 6, 78, 20],        // Lagos - India
    [-74, 5, -58, -34]     // Bogota - Buenos Aires
  ];
  // Scratch endpoints so arcPoint allocates nothing per call.
  var va = {}, vb = {};
  var PULSE_SPEED = 0.0004;
  var PULSE_WIDTH = 0.18;

  // Point of longitude/latitude (degrees) on a sphere of radius rad. Fills out {x, y, z}.
  function surface(lonDeg, latDeg, rad, out) {
    var lon = (lonDeg + LON_OFFSET) * RAD, la = latDeg * RAD;
    out.x = Math.cos(la) * Math.sin(lon) * rad;
    out.y = -Math.sin(la) * rad;
    out.z = Math.cos(la) * Math.cos(lon) * rad;
    return out;
  }

  // Point at s (0..1) along the great circle of a link, lifted off the globe by up to lift * rad
  // in the middle so the arc floats above the land. Fills out {x, y, z}.
  function arcPoint(link, s, lift, rad, out) {
    var a = surface(link[0], link[1], 1, va), b = surface(link[2], link[3], 1, vb);
    var dot = M.clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1), w = Math.acos(dot), sw = Math.sin(w);
    var ka = 1 - s, kb = s;
    // Coinciding endpoints have no unique circle: fall back to a straight blend. (Opposite endpoints
    // have none either and would collapse to the centre, so LINKS must not contain them.)
    if (sw > 1e-6) { ka = Math.sin((1 - s) * w) / sw; kb = Math.sin(s * w) / sw; }
    var x = a.x * ka + b.x * kb, y = a.y * ka + b.y * kb, z = a.z * ka + b.z * kb;
    var n = Math.hypot(x, y, z) || 1, r = rad * (1 + lift * Math.sin(Math.PI * s));
    out.x = (x / n) * r;
    out.y = (y / n) * r;
    out.z = (z / n) * r;
    return out;
  }

  // Brightness 0..1 of the point at fraction f along arc a at time t (ms): a pulse head
  // that travels from the source to the target, each arc a different fraction of the way round.
  function pulse(f, a, t) {
    var head = (t * PULSE_SPEED + a * 0.37) % 1.5 - 0.25;
    return M.clamp(1 - Math.abs(f - head) / PULSE_WIDTH, 0, 1);
  }

  window.TerminalArcs = { LINKS: LINKS, surface: surface, arcPoint: arcPoint, pulse: pulse };
})(window);

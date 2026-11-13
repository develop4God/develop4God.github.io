// Scene geometry and colouring for the /terminal/ point-cloud engine.
// A scene is { id, pts:[x,y,z], grp, frac, seed } as parallel arrays of length N.
// grp/frac/seed carry what paint() needs, so points can be re-ordered (align)
// without breaking colouring. y grows downward on screen.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  var N = 1800;
  var TAU = M.TAU;
  // Palette indices; the canvas maps them to theme colours.
  var INK = 0, LIME = 1, GOLD = 2, VIOLET = 3;

  function blank() {
    return { pts: [], grp: [], frac: [], seed: [] };
  }

  function push(sc, x, y, z, grp, frac) {
    sc.seed.push(sc.pts.length);
    sc.pts.push([x, y, z]);
    sc.grp.push(grp);
    sc.frac.push(frac);
  }

  // Fibonacci sphere of n points around (cx,cy,cz).
  function sphere(sc, n, cx, cy, cz, rad, grp) {
    for (var i = 0; i < n; i++) {
      var y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), th = i * 2.39996;
      push(sc, cx + Math.cos(th) * r * rad, cy + y * rad, cz + Math.sin(th) * r * rad, grp(i), i / n);
    }
  }

  function blob(sc, r, cx, cy, cz, rmin, rspan, grp) {
    var u = r() * 2 - 1, th = r() * TAU, rad = rmin + r() * rspan, s = Math.sqrt(1 - u * u);
    push(sc, cx + rad * s * Math.cos(th), cy + rad * u, cz + rad * s * Math.sin(th), grp, 0);
  }

  var GEN = {
    cloud: function (sc) {
      var r = M.rng(7);
      for (var i = 0; i < N; i++) {
        var u = r() * 2 - 1, th = r() * TAU, rad = 1.1 + r() * 0.9, s = Math.sqrt(1 - u * u);
        push(sc, rad * s * Math.cos(th), rad * u * 0.8, rad * s * Math.sin(th), 0, 0);
      }
    },
    twin: function (sc) {
      sphere(sc, N / 2, -0.9, 0, 0, 0.8, function () { return 0; });
      sphere(sc, N / 2, 0.9, 0, 0, 0.8, function () { return 1; });
    },
    pipeline: function (sc) {
      var per = N / 5;
      for (var k = 0; k < 5; k++) sphere(sc, per, -1.4 + k * 0.7, 0, 0, 0.3, function () { return k; });
    },
    languages: function (sc) {
      var per = N / 10, r = M.rng(21);
      for (var c = 0; c < 10; c++) {
        var ang = (c / 10) * TAU, cx = Math.cos(ang) * 1.25, cy = Math.sin(c * 2.1) * 0.22, cz = Math.sin(ang) * 1.25;
        for (var j = 0; j < per; j++) blob(sc, r, cx, cy, cz, 0.06, 0.22, c);
      }
    },
    lattice: function (sc) {
      for (var ix = 0; ix < 10; ix++) for (var iy = 0; iy < 9; iy++) for (var iz = 0; iz < 20; iz++) {
        push(sc, (ix - 4.5) * 0.2, (iy - 4) * 0.14 + (Math.floor(iy / 3) - 1) * 0.26, (iz - 9.5) * 0.1, Math.floor(iy / 3), 0);
      }
    },
    device: function (sc) {
      for (var ix = 0; ix < 18; ix++) for (var iy = 0; iy < 100; iy++) {
        push(sc, (ix - 8.5) * 0.075, (iy - 49.5) * 0.026, Math.sin(iy * 0.3) * 0.02, 0, iy / 100);
      }
    },
    // Land cells of a 2-degree map, sampled evenly by area onto a sphere.
    globe: function (sc) {
      var bin = atob(window.TerminalWorldMask), cells = [], r = M.rng(33), x, y;
      for (y = 0; y < 90; y++) for (x = 0; x < 180; x++) {
        var b = y * 180 + x;
        if ((bin.charCodeAt(b >> 3) >> (b & 7)) & 1) {
          var w = Math.cos(((90 - (y + 0.5) * 2) * Math.PI) / 180);
          cells.push({ x: x, y: y, k: Math.pow(r(), 1 / Math.max(w, 0.05)) });
        }
      }
      cells.sort(function (p, q) { return q.k - p.k; });
      cells.slice(0, N).forEach(function (c) {
        var lon = (((c.x + r()) * 2 - 180 - 70) * Math.PI) / 180, la = (((90 - (c.y + r()) * 2)) * Math.PI) / 180;
        push(sc, Math.cos(la) * Math.sin(lon) * 1.25, -Math.sin(la) * 1.25, Math.cos(la) * Math.cos(lon) * 1.25, 0, 0);
      });
    }
  };

  function make(id) {
    if (!Object.prototype.hasOwnProperty.call(GEN, id)) throw new Error('Unknown scene: ' + id);
    var sc = blank();
    sc.id = id;
    GEN[id](sc);
    return sc;
  }

  function widestAxis(pts, idx) {
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], k, i;
    for (i = 0; i < idx.length; i++) for (k = 0; k < 3; k++) {
      var v = pts[idx[i]][k];
      if (v < lo[k]) lo[k] = v;
      if (v > hi[k]) hi[k] = v;
    }
    var best = 0;
    for (k = 1; k < 3; k++) if (hi[k] - lo[k] > hi[best] - lo[best]) best = k;
    return best;
  }

  // Pairs two equal-size index sets by recursive median bisection along the
  // widest axis: each half of `from` is matched with the same-position half of
  // `to`, so neighbours stay neighbours and paths do not cross.
  function pairUp(fromPts, toPts, from, to, map) {
    if (from.length === 1) { map[from[0]] = to[0]; return; }
    var axis = widestAxis(fromPts, from);
    function byAxis(pts) { return function (p, q) { return pts[p][axis] - pts[q][axis]; }; }
    from = from.slice().sort(byAxis(fromPts));
    to = to.slice().sort(byAxis(toPts));
    var h = from.length >> 1;
    pairUp(fromPts, toPts, from.slice(0, h), to.slice(0, h), map);
    pairUp(fromPts, toPts, from.slice(h), to.slice(h), map);
  }

  // Re-orders `next` so point i travels to its spatial partner in `prev`:
  // short, uncrossed paths instead of a swirl.
  function align(prev, next) {
    var all = [], map = [], out = blank(), i;
    for (i = 0; i < prev.pts.length; i++) all.push(i);
    pairUp(prev.pts, next.pts, all, all, map);
    out.id = next.id;
    if (next.cls) out.cls = [];
    for (i = 0; i < prev.pts.length; i++) {
      var src = map[i];
      out.pts[i] = next.pts[src];
      out.grp[i] = next.grp[src];
      out.frac[i] = next.frac[src];
      out.seed[i] = next.seed[src];
      if (next.cls) out.cls[i] = next.cls[src];
    }
    return out;
  }

  function alignChain(scenes) {
    var res = [];
    scenes.forEach(function (sc, i) { res.push(i === 0 ? sc : align(res[i - 1], sc)); });
    return res;
  }

  // Colours one point of a scene at time t (ms). Writes out.c (palette index)
  // and out.a (0..1) so the render loop allocates nothing per point.
  function paint(sc, i, t, out) {
    var g = sc.grp[i], f = sc.frac[i], b;
    out.c = VIOLET;
    out.a = 0.9;
    switch (sc.id) {
      case 'logo': out.c = sc.cls[i]; out.a = 1; break;
      case 'pipeline': // a request pulse travels left to right
        b = M.clamp(1 - Math.abs(g + f - ((t * 0.0007) % 6.4)) * 1.5, 0, 1);
        out.c = b > 0.35 ? GOLD : LIME; out.a = 0.3 + 0.7 * b; break;
      case 'languages': // one language is verified at a time
        out.c = Math.floor(t / 900) % 10 === g ? GOLD : VIOLET; out.a = out.c === GOLD ? 1 : 0.75; break;
      case 'lattice': // only the active tenant is reachable
        out.c = Math.floor(t / 1200) % 3 === g ? LIME : VIOLET; out.a = out.c === LIME ? 1 : 0.22; break;
      case 'device': // a screen refresh scanning down the device
        b = M.clamp(1 - Math.abs(f - ((t * 0.0005) % 1.3 - 0.15)) * 7, 0, 1);
        out.c = b > 0.3 ? LIME : VIOLET; out.a = 0.35 + 0.65 * b; break;
      case 'globe': // readers around the world light up one by one
        out.c = (sc.seed[i] * 7919 + Math.floor(t / 350)) % 13 === 0 ? GOLD : VIOLET;
        out.a = out.c === GOLD ? 1 : 0.9; break;
      case 'twin': out.c = g === 0 ? LIME : GOLD; out.a = 1; break;
      default: break;
    }
    return out;
  }

  // Maps an RGBA pixel to a palette class, or -1 when it should be skipped.
  function classifyLogoPixel(r, g, b, a) {
    if (a < 140 || (r > 238 && g > 238 && b > 238)) return -1;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 45) return INK;
    if (g >= r && g >= b) return LIME;
    if (b >= r && b >= g) return VIOLET;
    return GOLD;
  }

  // Builds the logo scene from classified pixels { shield:[[x,y,cls]], text:[...] }.
  // The wordmark gets its own point budget (textShare) so thin letters such as
  // the "4" are not starved by the much larger shield.
  function logoScene(pixels, textShare) {
    if (!pixels.shield.length && !pixels.text.length) throw new Error('No logo pixels found');
    var r = M.rng(5), sc = blank(), nText = pixels.text.length ? Math.round(N * textShare) : 0, nShield = N - nText;
    sc.id = 'logo';
    sc.cls = [];
    function take(src, n, grp) {
      for (var i = 0; i < n; i++) {
        var p = src[Math.floor(r() * src.length)];
        push(sc, p[0], p[1], (r() - 0.5) * 0.06, grp, 0);
        sc.cls.push(p[2]);
      }
    }
    if (nShield) take(pixels.shield.length ? pixels.shield : pixels.text, nShield, 0);
    if (nText) take(pixels.text, nText, 1);
    return sc;
  }

  window.TerminalScenes = {
    N: N, INK: INK, LIME: LIME, GOLD: GOLD, VIOLET: VIOLET,
    make: make, align: align, alignChain: alignChain, paint: paint,
    classifyLogoPixel: classifyLogoPixel, logoScene: logoScene
  };
})(window);

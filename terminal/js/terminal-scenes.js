// Scene geometry and colouring for the /terminal/ point-cloud engine.
// A scene is { id, pts:[x,y,z], grp, frac, seed } as parallel arrays of length N.
// grp/frac/seed carry what paint() needs, so points can be re-ordered
// without breaking colouring. y grows downward on screen.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  var G = window.TerminalGlobe;
  var N = 1800;
  var TAU = M.TAU;
  // Palette indices; the canvas maps them to theme colours.
  var INK = 0, LIME = 1, GOLD = 2, VIOLET = 3;
  // Distance of each fork sphere's centre from the middle (the canvas pivots the spin on it).
  var TWIN_CENTER_X = 1.3;
  var GLOBE_RADIUS = 1.25;
  // Palette index of each globe continent band (see TerminalGlobe.continent).
  var GLOBE_COLOURS = [VIOLET, LIME, GOLD];
  // Opacity of a lit globe land dot on the dark theme, shared by the scene dots and the canvas's extra land.
  var GLOBE_ALPHA = 0.95;
  var LOGO_CANDIDATES = 8;
  // Sampling weight per palette class for the logo (indexed by INK, LIME, GOLD, VIOLET).
  var LOGO_WEIGHT = [1, 1, 1, 0.35];

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
      sphere(sc, N / 2, -TWIN_CENTER_X, 0, 0, 0.8, function () { return 0; });
      sphere(sc, N / 2, TWIN_CENTER_X, 0, 0, 0.8, function () { return 1; });
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
    // The first N land cells of a 2-degree map, sampled evenly by area onto a sphere and grouped by
    // continent (0 Americas, 1 Europe and Africa, 2 Asia and Oceania). The canvas adds more land and
    // the ocean as a layer of its own.
    globe: function (sc) {
      var land = G.land(N, 0, GLOBE_RADIUS);
      for (var i = 0; i < N; i++) push(sc, land.pts[i * 3], land.pts[i * 3 + 1], land.pts[i * 3 + 2], land.cls[i], 0);
    }
  };

  function make(id) {
    if (!Object.prototype.hasOwnProperty.call(GEN, id)) throw new Error('Unknown scene: ' + id);
    var sc = blank();
    sc.id = id;
    GEN[id](sc);
    return sc;
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
      case 'globe': // continents in the three palette colours
        out.c = GLOBE_COLOURS[g]; // opacity and size come from TerminalGlobe.landDot
        break;
      case 'twin': // violet like the other scenes, with a third of the dots in the sphere's own accent
        out.c = (sc.seed[i] * 7919) % 3 === 0 ? (g === 0 ? LIME : GOLD) : VIOLET; out.a = 1; break;
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
    // Best-candidate (blue-noise) sampling: each point is the best of a few
    // random candidates, scored by distance from those already chosen times the
    // class weight. Coverage stays even rather than clumpy, and the thin gold
    // circuit and outline keep more dots than the large violet fill.
    function take(src, n, grp) {
      var chosen = [];
      for (var i = 0; i < n; i++) {
        var best = null, bd = -1;
        for (var k = 0; k < LOGO_CANDIDATES; k++) {
          var c = src[Math.floor(r() * src.length)], d = Infinity;
          for (var j = 0; j < chosen.length; j++) {
            var dx = c[0] - chosen[j][0], dy = c[1] - chosen[j][1];
            d = Math.min(d, dx * dx + dy * dy);
          }
          d = (d === Infinity ? 1e9 : d) * LOGO_WEIGHT[c[2]];
          if (d > bd) { bd = d; best = c; }
        }
        chosen.push(best);
        push(sc, best[0], best[1], (r() - 0.5) * 0.06, grp, 0);
        // The grey wordmark takes the violet used by every other scene.
        sc.cls.push(best[2] === INK ? VIOLET : best[2]);
      }
    }
    if (nShield) take(pixels.shield.length ? pixels.shield : pixels.text, nShield, 0);
    if (nText) take(pixels.text, nText, 1);
    return sc;
  }

  // Centre x of fork sphere g (0 = hire, on the left; 1 = ministry, on the right).
  function twinCenter(g) {
    return g ? TWIN_CENTER_X : -TWIN_CENTER_X;
  }

  window.TerminalScenes = {
    N: N, TWIN_CENTER_X: TWIN_CENTER_X, twinCenter: twinCenter, 0.8: 0.8, GLOBE_RADIUS: GLOBE_RADIUS, GLOBE_COLOURS: GLOBE_COLOURS, GLOBE_ALPHA: GLOBE_ALPHA, INK: INK, LIME: LIME, GOLD: GOLD, VIOLET: VIOLET,
    make: make, paint: paint,
    classifyLogoPixel: classifyLogoPixel, logoScene: logoScene
  };
})(window);

// The globe's own drawing layer for the point-cloud canvas: the extra land and the ocean (outside the
// N-point morph), the scene's land dots drawn in the globe style, and the closing ring. Dots are grouped
// by colour and by near/far side, so every group is one fill at an exact opacity. Projection and
// grouping need no DOM; draw() only needs a 2D context, so the whole layer is testable with a fake one.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  var G = window.TerminalGlobe;
  // Below this fade the globe is too faint to be worth projecting and drawing.
  var MIN_FADE = 0.03;
  // The silhouette ring only shows once the globe has settled, so it never drifts off the sphere.
  var RING_SETTLED = 0.9, RING_ALPHA = 0.55;
  // Smallest dot radius in px, so the globe stays visible when it is drawn small.
  var MIN_DOT = 0.4;

  // opts: { radius, colours (palette index per continent), violet, sceneDots, litDark }
  function create(opts) {
    var data = null, failed = false, pr = {};
    var rad = opts.radius, frame = { ox: 0, oy: 0, scale: 1, dark: true, fade: 0, cam: M.CAMERA }, globeR = 0;
    // The scene's own land dots, grouped by continent and near/far side. They need nothing built, so they
    // show even if the extra layer is late or fails.
    var cap = opts.sceneDots + G.LAND_EXTRA, groups = [], gi;
    for (gi = 0; gi < opts.colours.length * 2; gi++) groups.push({ x: new Float32Array(cap), y: new Float32Array(cap), r: new Float32Array(cap), n: 0 });

    // Builds the extra land, ocean and ring into locals and assigns them together, so a failure never leaves a
    // half-built layer. A failure is logged once and the extras are lost; the scene's own dots still show.
    function build() {
      if (data) return true;
      if (failed) return false;
      try {
        var land = G.land(G.LAND_EXTRA, opts.sceneDots, rad), sea = G.sea(G.SEA_DOTS, rad), q;
        var ringCos = new Float32Array(G.RING_DOTS), ringSin = new Float32Array(G.RING_DOTS);
        for (q = 0; q < G.RING_DOTS; q++) {
          ringCos[q] = Math.cos((q / G.RING_DOTS) * M.TAU);
          ringSin[q] = Math.sin((q / G.RING_DOTS) * M.TAU);
        }
        data = {
          land: land, sea: sea, ringCos: ringCos, ringSin: ringSin,
          ringX: new Float32Array(G.RING_DOTS), ringY: new Float32Array(G.RING_DOTS),
          seaNear: { x: new Float32Array(G.SEA_DOTS), y: new Float32Array(G.SEA_DOTS), n: 0 },
          seaFar: { x: new Float32Array(G.SEA_DOTS), y: new Float32Array(G.SEA_DOTS), n: 0 }
        };
        return true;
      } catch (e) {
        failed = true;
        console.error('TerminalGlobeLayer: build failed', e);
        return false;
      }
    }

    // Starts a frame: where the globe sits ({ox, oy, scale}), the theme, how much of it shows, the camera.
    function begin(f) {
      frame = f;
      globeR = rad * f.scale;
      for (var q = 0; q < groups.length; q++) groups[q].n = 0;
      if (!data) return;
      data.seaNear.n = 0;
      data.seaFar.n = 0;
    }

    // Adds one land dot at screen position (sx, sy): `continent` is its colour band, `z` its depth.
    function addDot(continent, z, sx, sy) {
      var g = groups[continent * 2 + (z > G.BACK_Z ? 1 : 0)];
      if (g.n >= cap) return;
      g.x[g.n] = sx;
      g.y[g.n] = sy;
      g.r[g.n] = minDot(globeR * G.landRadius(z, rad));
      g.n++;
    }

    // Projects the extra land and the ocean for this frame.
    function addExtras(rot) {
      if (!data || !shows()) return;
      var land = data.land, sea = data.sea, i, ln = land.cls.length, sn = sea.length / 3, sx, sy, s;
      for (i = 0; i < ln; i++) {
        M.project(land.pts[i * 3], land.pts[i * 3 + 1], land.pts[i * 3 + 2], rot, pr, frame.cam);
        addDot(land.cls[i], pr.z, frame.ox + pr.x * frame.scale, frame.oy + pr.y * frame.scale);
      }
      for (i = 0; i < sn; i++) {
        M.project(sea[i * 3], sea[i * 3 + 1], sea[i * 3 + 2], rot, pr, frame.cam);
        sx = frame.ox + pr.x * frame.scale;
        sy = frame.oy + pr.y * frame.scale;
        s = pr.z > G.BACK_Z ? data.seaFar : data.seaNear;
        s.x[s.n] = sx;
        s.y[s.n] = sy;
        s.n++;
      }
    }

    function minDot(r) {
      return Math.max(MIN_DOT, r);
    }

    // True while the globe is visible enough to be worth projecting and drawing.
    function shows() {
      return frame.fade > MIN_FADE;
    }

    // Fills n dots of one radius as a single path.
    function fillDots(cx, xs, ys, n, r) {
      var rr = minDot(r);
      cx.beginPath();
      for (var q = 0; q < n; q++) { cx.moveTo(xs[q] + rr, ys[q]); cx.arc(xs[q], ys[q], rr, 0, M.TAU); }
      cx.fill();
    }

    // Fills a group of dots that each carry their own radius as a single path.
    function fillGroup(cx, g) {
      cx.beginPath();
      for (var q = 0; q < g.n; q++) { cx.moveTo(g.x[q] + g.r[q], g.y[q]); cx.arc(g.x[q], g.y[q], g.r[q], 0, M.TAU); }
      cx.fill();
    }

    // `pal` maps palette indices to CSS colours. The ocean goes down first, then the land, then the ring.
    function draw(cx, pal) {
      if (!shows()) return;
      var lit = frame.dark ? opts.litDark : 1, q, g;
      if (data) {
        cx.fillStyle = pal[opts.violet];
        cx.globalAlpha = G.SEA_BACK_ALPHA * lit * frame.fade;
        fillDots(cx, data.seaFar.x, data.seaFar.y, data.seaFar.n, globeR * G.DOT.SEA_FAR);
        cx.globalAlpha = G.SEA_ALPHA * lit * frame.fade;
        fillDots(cx, data.seaNear.x, data.seaNear.y, data.seaNear.n, globeR * G.DOT.SEA);
      }
      for (q = 0; q < groups.length; q++) {
        g = groups[q];
        if (!g.n) continue;
        cx.fillStyle = pal[opts.colours[q >> 1]];
        cx.globalAlpha = G.landAlpha((q & 1) === 1, lit, frame.fade);
        fillGroup(cx, g);
      }
      if (data && frame.fade > RING_SETTLED) {
        var ringR = G.limbRadius(rad, frame.cam) * frame.scale;
        for (q = 0; q < data.ringCos.length; q++) {
          data.ringX[q] = frame.ox + data.ringCos[q] * ringR;
          data.ringY[q] = frame.oy + data.ringSin[q] * ringR;
        }
        cx.fillStyle = pal[opts.violet];
        cx.globalAlpha = RING_ALPHA * M.clamp((frame.fade - RING_SETTLED) / (1 - RING_SETTLED), 0, 1);
        fillDots(cx, data.ringX, data.ringY, data.ringX.length, globeR * G.DOT.RING);
      }
    }

    return { build: build, begin: begin, shows: shows, addDot: addDot, addExtras: addExtras, draw: draw };
  }

  window.TerminalGlobeLayer = { create: create, MIN_FADE: MIN_FADE };
})(window);

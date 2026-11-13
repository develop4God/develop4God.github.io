// Point-cloud renderer for one pinned story: draws N points that morph between
// scenes as scroll progress advances. Short, uncrossed paths (scenes are
// pre-aligned) and a camera that holds still while points are in motion avoid
// the swirl of a naive morph. Draws are batched by colour and alpha.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  var S = window.TerminalScenes;
  var LEVELS = 8;
  var LOGO_TEXT_SHARE = 0.5;
  var LOGO_TEXT_TOP = 0.64;

  function wrapPi(a) {
    return a - M.TAU * Math.round(a / M.TAU);
  }

  // Samples the logo image into classified world-space pixels, split into the
  // shield and the wordmark below it.
  function sampleLogo(img) {
    var sw = 280, sh = Math.round((sw * img.naturalHeight) / img.naturalWidth);
    var c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, sw, sh);
    var d = x.getImageData(0, 0, sw, sh).data, scale = 3.0 / sw, textTop = Math.round(sh * LOGO_TEXT_TOP);
    var out = { shield: [], text: [] };
    for (var py = 0; py < sh; py++) for (var px = 0; px < sw; px++) {
      var k = (py * sw + px) * 4, cls = S.classifyLogoPixel(d[k], d[k + 1], d[k + 2], d[k + 3]);
      if (cls < 0) continue;
      (py >= textTop ? out.text : out.shield).push([(px - sw / 2) * scale, (py - sh / 2) * scale, cls]);
    }
    return out;
  }

  // Where a scene sits on the canvas, as fractions of its size. On wide screens
  // text is on the left, so scenes sit right; the fork spheres sit top-centre
  // above the door cards. Large scenes (globe, language clusters) are scaled down.
  function layout(id, wide) {
    var l = wide ? { x: 0.68, y: 0.5, s: 0.3 } : { x: 0.5, y: 0.3, s: 0.24 };
    if (id === 'twin' && wide) return { x: 0.5, y: 0.25, s: 0.17 };
    if (id === 'globe' || id === 'languages') l.s *= 0.85;
    if (id === 'logo') l.s *= 0.83;
    return l;
  }

  // opts: { canvas, pin, story, sceneIds, getProgress, reduce, logoUrl? }
  function create(opts) {
    var cv = opts.canvas, cx = cv.getContext('2d'), pin = opts.pin, reduce = opts.reduce;
    var N = S.N, scenes = [], introCloud = null, stagger = [];
    var W = 0, H = 0, wide = true, dark = true, pal = ['#fff', '#b4d447', '#dea946', '#8f7fd0'];
    var yaw = 0, pitch = 0, lw = 0, driftAng = 0, globeAng = 0, last = 0, mx = 0.5, my = 0.5, smx = 0.5, smy = 0.5;
    var t0 = performance.now(), running = false, raf = 0;
    var buckets = [], out = { c: 0, a: 0 }, pr = {};

    var r2 = M.rng(99);
    for (var i = 0; i < N; i++) stagger.push(r2());
    for (var b = 0; b < pal.length * LEVELS; b++) buckets.push({ x: [], y: [], r: [], n: 0 });

    function setScenes(list, cloud) {
      scenes = S.alignChain(list);
      introCloud = cloud ? S.align(scenes[0], cloud) : null;
    }

    var ids = opts.sceneIds.slice(), hasLogo = ids[0] === 'logo';
    // Until the logo image is sampled, a loose cloud stands in for it.
    setScenes(ids.map(function (id) { return S.make(id === 'logo' ? 'cloud' : id); }));
    if (hasLogo && opts.logoUrl) {
      var img = new Image();
      img.onload = function () {
        try {
          var logo = S.logoScene(sampleLogo(img), LOGO_TEXT_SHARE);
          t0 = performance.now();
          setScenes([logo].concat(ids.slice(1).map(S.make)), S.make('cloud'));
          redraw();
        } catch (e) { console.error('TerminalCanvas: logo sampling failed', e); }
      };
      img.onerror = function () { console.error('TerminalCanvas: logo image failed to load', opts.logoUrl); };
      img.src = opts.logoUrl;
    }

    function colors() {
      var s = getComputedStyle(document.documentElement), v = function (n, f) { return s.getPropertyValue(n).trim() || f; };
      pal = [v('--ink', '#fff'), v('--lime', '#b4d447'), v('--gold', '#dea946'), v('--violet', '#8f7fd0')];
      dark = v('--dark', '1') === '1';
    }

    function size() {
      var r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
      if (!r.width || !r.height) return;
      W = r.width;
      H = r.height;
      cv.width = W * d;
      cv.height = H * d;
      cx.setTransform(d, 0, 0, d, 0, 0);
      wide = W > 820;
      colors();
    }

    function frame(t) {
      if (!W || !scenes.length) return;
      var dt = last ? M.clamp(t - last, 0, 50) : 16;
      last = t;
      var p = reduce ? 0 : opts.getProgress(), sg = M.segment(p, scenes.length), a = sg.a, lt = sg.lt;
      var A = scenes[a], B = scenes[Math.min(a + 1, scenes.length - 1)], morphing = scenes.length > 1 && lt > 0.02 && lt < 0.98;

      smx += (mx - smx) * Math.min(1, dt * 0.006);
      smy += (my - smy) * Math.min(1, dt * 0.006);
      if (!morphing && !reduce) {
        // The camera only moves once the points have settled into a scene.
        var cur = lt < 0.5 ? A : B, k = Math.min(1, dt * 0.004), ty, tp;
        if (cur.id === 'logo') { ty = 0; tp = 0; lw += (1 - lw) * k; }
        else {
          lw += (0 - lw) * k;
          if (cur.id === 'globe') { globeAng += dt * 0.0003; ty = -1.4 + globeAng; tp = 0.12; }
          else { driftAng += dt * 0.00018; ty = driftAng; tp = 0.35; }
        }
        yaw += wrapPi(ty - yaw) * k;
        pitch += (tp - pitch) * k;
      }
      var rot = M.rotation(yaw + (smx - 0.5) * 0.4 * (1 - lw * 0.6), pitch + (smy - 0.5) * 0.2);
      var la = layout(A.id, wide), lb = layout(B.id, wide), le = M.ease(lt);
      var scale = Math.min(W, H) * (la.s + (lb.s - la.s) * le), ox = W * (la.x + (lb.x - la.x) * le), oy = H * (la.y + (lb.y - la.y) * le);
      var intro = reduce || !introCloud || a !== 0 ? 1 : M.ease(M.clamp((t - t0) / 1800, 0, 1));
      var baseA = dark ? 0.22 : 0.4, spanA = dark ? 0.78 : 0.6, i, j, bk;

      for (j = 0; j < buckets.length; j++) buckets[j].n = 0;
      for (i = 0; i < N; i++) {
        var k2 = M.ease(M.clamp(lt * 1.5 - stagger[i] * 0.5, 0, 1)), pa = A.pts[i], pb = B.pts[i], px = pa[0], py = pa[1], pz = pa[2];
        if (intro < 1) {
          var cp = introCloud.pts[i], e = M.ease(M.clamp(intro * 1.4 - stagger[i] * 0.4, 0, 1));
          px = cp[0] + (px - cp[0]) * e; py = cp[1] + (py - cp[1]) * e; pz = cp[2] + (pz - cp[2]) * e;
        }
        var x = px + (pb[0] - px) * k2, y = py + (pb[1] - py) * k2, z = pz + (pb[2] - pz) * k2;
        M.project(x, y, z, rot, pr);
        var sc = k2 > 0.5 ? B : A;
        S.paint(sc, i, t, out);
        var far = sc.id === 'globe' && pr.z > 0.1 ? 0.1 : 1;
        var alpha = M.clamp((baseA + pr.d * spanA) * out.a * far * (intro < 1 ? 0.6 + 0.4 * intro : 1), 0, 1);
        bk = buckets[out.c * LEVELS + Math.min(LEVELS - 1, Math.floor(alpha * LEVELS))];
        bk.x[bk.n] = ox + pr.x * scale;
        bk.y[bk.n] = oy + pr.y * scale;
        bk.r[bk.n] = (intro < 1 ? 1 : 0.6) + 1.4 * pr.f;
        bk.n++;
      }
      cx.clearRect(0, 0, W, H);
      for (j = 0; j < buckets.length; j++) {
        bk = buckets[j];
        if (!bk.n) continue;
        cx.globalAlpha = ((j % LEVELS) + 0.5) / LEVELS;
        cx.fillStyle = pal[Math.floor(j / LEVELS)];
        cx.beginPath();
        for (i = 0; i < bk.n; i++) { cx.moveTo(bk.x[i] + bk.r[i], bk.y[i]); cx.arc(bk.x[i], bk.y[i], bk.r[i], 0, M.TAU); }
        cx.fill();
      }
      cx.globalAlpha = 1;
    }

    function redraw() { frame(performance.now()); }
    function loop(t) { frame(t); if (running && !reduce) raf = requestAnimationFrame(loop); }

    new IntersectionObserver(function (es) {
      running = es[0].isIntersecting;
      cancelAnimationFrame(raf);
      if (running && !reduce) raf = requestAnimationFrame(loop);
    }).observe(opts.story);
    new ResizeObserver(function () { size(); redraw(); }).observe(cv);
    pin.addEventListener('pointermove', function (e) {
      var r = pin.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width;
      my = (e.clientY - r.top) / r.height;
    });
    new MutationObserver(function () { colors(); redraw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    size();
    redraw();
    return { redraw: redraw };
  }

  window.TerminalCanvas = { create: create };
})(window);

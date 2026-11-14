// Point-cloud renderer for one pinned story: draws N points that morph between
// scenes as scroll progress advances. Short, uncrossed paths (scenes are
// pre-aligned) and a camera that holds still while points are in motion avoid
// the swirl of a naive morph. Draws are batched by colour and alpha.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  var S = window.TerminalScenes;
  var LI = window.TerminalLogoImage;
  var TL = window.TerminalTwinLife;
  var LO = window.TerminalLayout;
  var SP = window.TerminalSpin;
  var G = window.TerminalGlobe;
  var GL = window.TerminalGlobeLayer;
  var LEVELS = 8;
  var LOGO_TEXT_SHARE = 0.38;
  var LOGO_TEXT_TOP = 0.64;
  // The real logo is rebuilt from one dot per DENSE_STEP source pixels, in its own colours.
  var DENSE_STEP = 2;

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

  // opts: { canvas, pin, story, sceneIds, getProgress, getTarget, reduce, logoUrl?, getFree? }
  // Dots move between scenes like dust: each keeps its own point order (random pairing) and
  // starts at its own moment (per-dot stagger), so the scene gathers and disperses unevenly.
  function create(opts) {
    var cv = opts.canvas, cx = cv.getContext('2d'), pin = opts.pin, reduce = opts.reduce;
    var N = S.N, scenes = [], stagger = [];
    var W = 0, H = 0, wide = true, dark = true, pal = ['#fff', '#b4d447', '#dea946', '#8f7fd0'];
    var yaw = 0, pitch = 0, lw = 0, driftAng = 0, last = 0, mx = 0.5, my = 0.5, smx = 0.5, smy = 0.5;
    var t0 = performance.now(), running = false, raf = 0;
    var buckets = [], out = { c: 0, a: 0 }, pr = {}, pr2 = {}, free = 0, freeAt = -1e9;
    var logoImg = null, logoBmp = null, logoDots = [], dotBuckets = [], logoTint = '', hintTarget = -1, hints = [0, 0], moBuf = [{}, {}], spinBuf = [{}, {}], logoPending = false, twinPt = { x: 0, y: 0, z: 0 };

    var r2 = M.rng(99);
    for (var i = 0; i < N; i++) stagger.push(r2());
    for (var b = 0; b < pal.length * LEVELS; b++) buckets.push({ x: [], y: [], r: [], n: 0 });
    for (var kb = 0; kb < LI.COLOR_KEYS; kb++) dotBuckets.push({ x: [], y: [], n: 0, fill: 'rgb(' + LI.keyRgb(kb).join(',') + ')' });

    var ids = opts.sceneIds.slice(), hasLogo = ids[0] === 'logo';
    // The globe's extra land, ocean and ring live in their own layer; it is built while the browser is idle.
    var globe = ids.indexOf('globe') >= 0 ? GL.create({ radius: S.GLOBE_RADIUS, colours: S.GLOBE_COLOURS, violet: S.VIOLET, sceneDots: N, litDark: S.GLOBE_ALPHA }) : null;
    var globeFrame = { ox: 0, oy: 0, scale: 1, dark: true, fade: 0, cam: M.CAMERA };
    if (globe) {
      if (window.requestIdleCallback) window.requestIdleCallback(globe.build, { timeout: 1500 });
      else window.setTimeout(globe.build, 200);
    }
    // The logo scene starts as a loose cloud of placeholder dots; it stays hidden while the logo
    // image loads (logoPending) and is only shown if the image never arrives.
    scenes = ids.map(function (id) { return S.make(id === 'logo' ? 'cloud' : id); });
    if (hasLogo && opts.logoUrl) {
      logoPending = true;
      // If the logo is very slow, show the placeholder dots rather than a blank hero.
      var pendingTimer = setTimeout(function () { logoPending = false; }, 4000);
      var img = new Image();
      img.onload = function () {
        try {
          var logo = S.logoScene(sampleLogo(img), LOGO_TEXT_SHARE);
          logoImg = img;
          rebuildLogo();
          logoPending = false;
          clearTimeout(pendingTimer);
          t0 = performance.now();
          scenes = [logo].concat(ids.slice(1).map(S.make));
          redraw();
        } catch (e) { logoPending = false; console.error('TerminalCanvas: logo sampling failed', e); }
      };
      img.onerror = function () { logoPending = false; console.error('TerminalCanvas: logo image failed to load', opts.logoUrl); };
      img.src = opts.logoUrl;
    }

    var tintCx = null;
    function cssRgb(css) {
      tintCx = tintCx || document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      tintCx.clearRect(0, 0, 1, 1);
      tintCx.fillStyle = css;
      tintCx.fillRect(0, 0, 1, 1);
      return Array.prototype.slice.call(tintCx.getImageData(0, 0, 1, 1).data, 0, 3);
    }

    // The real logo with its grey wordmark tinted to the shared violet so it matches the dots.
    function buildLogoBitmap(tint) {
      var w = logoImg.naturalWidth, h = logoImg.naturalHeight, bmp = document.createElement('canvas'), bx = bmp.getContext('2d', { willReadFrequently: true });
      bmp.width = w;
      bmp.height = h;
      bx.drawImage(logoImg, 0, 0);
      var id = bx.getImageData(0, 0, w, h);
      LI.tintWordmark(id.data, w, h, Math.round(h * LOGO_TEXT_TOP), tint);
      bx.putImageData(id, 0, 0);
      logoBmp = bmp;
      logoDots = LI.densePoints(id.data, w, h, DENSE_STEP, M.rng(11));
    }

    // Rebuilds the logo bitmap and dot field only when the tint colour actually changed (a theme
    // switch), not on every resize. A failure leaves the plain dot logo in place.
    function rebuildLogo() {
      try {
        var tint = cssRgb(pal[S.VIOLET]), key = tint.join(',');
        if (key === logoTint) return;
        buildLogoBitmap(tint);
        logoTint = key;
      } catch (e) {
        logoBmp = null;
        logoDots = [];
        console.error('TerminalCanvas: logo bitmap failed', e);
      }
    }

    function colors() {
      var s = getComputedStyle(document.documentElement), v = function (n, f) { return s.getPropertyValue(n).trim() || f; };
      pal = [v('--ink', '#fff'), v('--dot-lime', v('--lime', '#b4d447')), v('--dot-gold', v('--gold', '#dea946')), v('--violet', '#8f7fd0')];
      dark = v('--dark', '1') === '1';
      if (logoImg) rebuildLogo();
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
      var p = reduce ? 0 : opts.getProgress(), sg = M.segment(p, scenes.length), a = sg.a, rawLt = sg.lt;
      // While the real logo is up, the dots hold still until it has dissolved into them.
      var lt = logoBmp && a === 0 && !reduce ? LI.morphProgress(rawLt) : rawLt;
      var A = scenes[a], B = scenes[Math.min(a + 1, scenes.length - 1)], morphing = scenes.length > 1 && lt > 0.02 && lt < 0.98;

      smx += (mx - smx) * Math.min(1, dt * 0.006);
      smy += (my - smy) * Math.min(1, dt * 0.006);
      if (!morphing && !reduce) {
        // The camera only moves once the points have settled into a scene.
        var cur = lt < 0.5 ? A : B, k = Math.min(1, dt * 0.004), ty, tp;
        // The logo and the fork spheres face the front so they read clearly.
        if (cur.id === 'logo' || cur.id === 'twin') { ty = 0; tp = cur.id === 'logo' ? 0 : SP.TILT; lw += (1 - lw) * k; }
        else {
          lw += (0 - lw) * k;
          if (cur.id === 'globe') { ty = G.VIEW_YAW - SP.angle(t, 0); tp = -SP.TILT; }
          else { driftAng += dt * 0.00018; ty = driftAng; tp = 0.35; }
        }
        yaw += M.wrapPi(ty - yaw) * k;
        pitch += (tp - pitch) * k;
      }
      var rot = M.rotation(yaw + (smx - 0.5) * 0.4 * (1 - lw * 0.6), pitch + (smy - 0.5) * 0.2);
      if (opts.getFree && t - freeAt > 400) { free = opts.getFree(); freeAt = t; }
      var la = LO.place(A.id, wide, free, W, H), lb = LO.place(B.id, wide, free, W, H), le = M.ease(lt);
      var scale = Math.min(W, H) * (la.s + (lb.s - la.s) * le), ox = W * (la.x + (lb.x - la.x) * le), oy = H * (la.y + (lb.y - la.y) * le);
      // On the pale light theme dots need more weight than on the dark one.
      var baseA = dark ? 0.22 : 0.72, spanA = dark ? 0.78 : 0.28, i, j, bk;
      // What to show of the real logo; heading back to it after its first build-up just fades the
      // image in once the dots are home, the dense dots only fly in on the first visit and when leaving.
      var onLogo = logoBmp && a === 0, vs = onLogo ? LI.viewState(t - t0, rawLt, opts.getTarget() === 0, reduce) : null, pm = vs ? vs.pm : logoPending && a === 0 && !reduce ? 0 : 1;
      // The globe is drawn without perspective: the camera backs away as it takes over from another scene.
      var gw = G.globeWeight(A.id, B.id, le), cam = G.cameraFor(gw);
      if (globe) {
        globeFrame.ox = ox;
        globeFrame.oy = oy;
        globeFrame.scale = scale;
        globeFrame.dark = dark;
        globeFrame.fade = gw * pm;
        globeFrame.cam = cam;
        globe.begin(globeFrame);
      }

      // Settled fork spheres sway and breathe, and the one a door points at grows and glows.
      var twinSc = A.id === 'twin' ? A : B.id === 'twin' ? B : null, tw = twinSc && !reduce ? TL.twinSettle(lt, A.id === 'twin', B.id === 'twin') : 0, mo = null, g, m, gl, dw;
      // A hint only counts while the spheres are settled on screen (the doors are hidden otherwise).
      for (g = 0; g < 2; g++) hints[g] = TL.stepHint(hints[g], tw > 0 && hintTarget === g ? 1 : 0, dt);
      // The spheres turn whenever they are on screen (settled or not), so a dot flying in lands on a moving target.
      if (twinSc) {
        for (g = 0; g < 2; g++) {
          TL.twinSpin(t, g, spinBuf[g]);
          // With reduced motion the spheres stay at rest, not at the spin's starting angle.
          if (reduce) { spinBuf[g].cos = 1; spinBuf[g].sin = 0; }
        }
      }
      if (tw > 0) {
        for (g = 0; g < 2; g++) TL.twinMotion(t, g, tw, Math.max(hints[g], TL.idleHint(t, g)), moBuf[g]);
        mo = moBuf;
      }

      for (j = 0; j < buckets.length; j++) buckets[j].n = 0;
      for (i = 0; i < N && pm >= 0.03; i++) {
        var k2 = M.ease(M.clamp(lt * 1.5 - stagger[i] * 0.5, 0, 1)), pa = A.pts[i], pb = B.pts[i], px = pa[0], pz = pa[2], qx = pb[0], qz = pb[2];
        if (twinSc) {
          // The end of the flight that lies in a fork sphere is that sphere's dot, turned with it.
          g = twinSc.grp[i];
          if (A === twinSc) { TL.spinPoint(px, pa[1], pz, S.twinCenter(g), spinBuf[g], twinPt); px = twinPt.x; pz = twinPt.z; }
          if (B === twinSc) { TL.spinPoint(qx, pb[1], qz, S.twinCenter(g), spinBuf[g], twinPt); qx = twinPt.x; qz = twinPt.z; }
        }
        var py = pa[1], x = px + (qx - px) * k2, y = py + (pb[1] - py) * k2, z = pz + (qz - pz) * k2;
        gl = 0;
        if (mo) {
          // A dot takes on the sphere's motion only as it lands in (or while it has not yet left) the sphere.
          g = twinSc.grp[i];
          m = mo[g];
          dw = twinSc === B ? k2 : 1 - k2;
          TL.twinPoint(x, y, z, S.twinCenter(g), m, dw, twinPt);
          x = twinPt.x;
          y = twinPt.y;
          z = twinPt.z;
          gl = m.glow * dw;
        }
        M.project(x, y, z, rot, pr, cam);
        var sc = k2 > 0.5 ? B : A;
        if (sc.id === 'globe') {
          globe.addDot(sc.grp[i], pr.z, ox + pr.x * scale, oy + pr.y * scale);
          continue;
        }
        S.paint(sc, i, t, out);
        var sceneA = dark ? out.a : 0.55 + 0.45 * out.a;
        var alpha = M.clamp((baseA + pr.d * spanA) * sceneA * pm * (1 + 0.5 * gl), 0, 1);
        bk = buckets[out.c * LEVELS + Math.min(LEVELS - 1, Math.floor(alpha * LEVELS))];
        bk.x[bk.n] = ox + pr.x * scale;
        bk.y[bk.n] = oy + pr.y * scale;
        bk.r[bk.n] = 0.6 + 1.4 * pr.f + (dark ? 0 : 0.6) + 0.8 * gl;
        bk.n++;
      }
      if (globe && globe.shows() && globe.build()) globe.addExtras(rot);
      cx.clearRect(0, 0, W, H);
      if (globe) globe.draw(cx, pal);
      for (j = 0; j < buckets.length; j++) {
        bk = buckets[j];
        if (!bk.n) continue;
        cx.globalAlpha = ((j % LEVELS) + 0.5) / LEVELS;
        cx.fillStyle = pal[Math.floor(j / LEVELS)];
        cx.beginPath();
        for (i = 0; i < bk.n; i++) { cx.moveTo(bk.x[i] + bk.r[i], bk.y[i]); cx.arc(bk.x[i], bk.y[i], bk.r[i], 0, M.TAU); }
        cx.fill();
      }
      if (vs && (vs.dense || vs.pngA > 0.01)) {
        var hh = (1.5 * logoBmp.height) / logoBmp.width;
        M.project(-1.5, -hh, 0, rot, pr);
        M.project(1.5, hh, 0, rot, pr2);
        var lx0 = ox + pr.x * scale, ly0 = oy + pr.y * scale, lw0 = (pr2.x - pr.x) * scale, lh0 = (pr2.y - pr.y) * scale;
        var sk = lw0 / logoBmp.width, ds = Math.max(1.4, DENSE_STEP * sk), pngA = vs.pngA, nb, ph;
        if (vs.dense) {
          // Dense true-colour dots fly home from random places; more of them are on screen as r grows.
          for (nb = 0; nb < LI.COLOR_KEYS; nb++) dotBuckets[nb].n = 0;
          logoDots.forEach(function (d) {
            ph = LI.dotPhase(vs.rv, d.dl);
            if (ph <= 0) return;
            var bb = dotBuckets[d.key];
            bb.x[bb.n] = lx0 + (d.sx + (d.tx - d.sx) * ph) * sk;
            bb.y[bb.n] = ly0 + (d.sy + (d.ty - d.sy) * ph) * sk;
            bb.n++;
          });
          cx.globalAlpha = 1;
          dotBuckets.forEach(function (bb) {
            if (!bb.n) return;
            cx.fillStyle = bb.fill;
            cx.beginPath();
            for (var q = 0; q < bb.n; q++) cx.rect(bb.x[q], bb.y[q], ds, ds);
            cx.fill();
          });
        }
        if (pngA > 0.01) {
          cx.globalAlpha = pngA;
          cx.drawImage(logoBmp, lx0, ly0, lw0, lh0);
        }
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
    // The fork door under the pointer or focus, as the sphere it stands for (-1 for none).
    return { redraw: redraw, setHint: function (sphere) { hintTarget = sphere; } };
  }

  window.TerminalCanvas = { create: create };
})(window);

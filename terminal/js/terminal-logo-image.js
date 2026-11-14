// The real logo image shown over the hero's point cloud once the dots have fully
// assembled it. More and more tiny true-colour dots fly in from random places until the whole
// image is filled in, then the crisp image replaces them; the same happens in reverse
// when the story moves on, after which the sparse dots morph to the next scene. The logo
// never reads as incomplete.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  // The dots take about 1800 ms to assemble the logo; the image only starts after that.
  var REVEAL_DELAY = 2000;
  var REVEAL_FADE = 2800;
  // The image dissolves into the still-assembled dots over this share of the way to the
  // next scene; only after that do the dots start to morph (see morphProgress).
  var LEAVE_SPAN = 0.5;

  // How far the dots have turned into the real logo, 0..1. elapsed: ms since the logo dots began assembling.
  // lt: 0..1 progress of the morph away from the logo scene.
  function revealProgress(elapsed, lt) {
    if (!(elapsed > REVEAL_DELAY)) return 0;
    var enter = M.ease(M.clamp((elapsed - REVEAL_DELAY) / REVEAL_FADE, 0, 1));
    return enter * (1 - M.ease(M.clamp(lt / LEAVE_SPAN, 0, 1)));
  }

  // Morph progress of the dots: they hold the assembled logo while the image dissolves.
  function morphProgress(lt) {
    return M.clamp((lt - LEAVE_SPAN) / (1 - LEAVE_SPAN), 0, 1);
  }

  // Coming back to the logo after the first build-up, the image just fades in over the last
  // RETURN_SPAN of the way back (no second dot fly-in). RETURN_SPAN <= LEAVE_SPAN so the sparse
  // dots are already home when it starts.
  var RETURN_SPAN = 0.35;
  function returnAlpha(lt) {
    return M.ease(M.clamp((RETURN_SPAN - lt) / RETURN_SPAN, 0, 1));
  }

  // True once the first build-up has finished (elapsed ms since the logo dots began assembling).
  function isRevealed(elapsed) {
    return elapsed >= REVEAL_DELAY + REVEAL_FADE;
  }

  // Opacity of the assembled sparse dots: they give way as the dense dot field fills in.
  function dotsAlpha(r) {
    return 1 - M.ease(M.clamp((r - 0.15) / 0.7, 0, 1));
  }

  // Opacity of the crisp image: it replaces the dot field only once that is complete.
  function pngAlpha(r) {
    return M.ease(M.clamp((r - 0.92) / 0.08, 0, 1));
  }

  // How far dot `dl` (its random delay, 0..1) has travelled home, 0..1 (ease-out). Dots
  // start at different moments, so the count on screen grows until the image is complete.
  function dotPhase(r, dl) {
    var t = M.clamp((r - dl * 0.55) / 0.45, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  // Samples an RGBA image into dense true-colour dots, one per step x step cell, each with a
  // random scatter origin (sx, sy, in image px) and delay. Transparent pixels get no dot.
  function densePoints(data, width, height, step, rng) {
    var pts = [];
    for (var y = 0; y < height; y += step) {
      for (var x = 0; x < width; x += step) {
        var k = (y * width + x) * 4;
        if (data[k + 3] < 140) continue;
        pts.push({
          tx: x, ty: y, key: colorKey(data[k], data[k + 1], data[k + 2]), dl: rng(),
          sx: width / 2 + (rng() - 0.5) * width * 1.4, sy: height / 2 + (rng() - 0.5) * height * 1.1
        });
      }
    }
    return pts;
  }

  // What the canvas shows of the real logo. elapsed: ms since the logo dots began assembling;
  // rawLt: 0..1 progress away from the logo scene; towardLogo: the story is heading back to it.
  // Returns { rv: reveal progress (drives dotPhase), pm: opacity of the sparse dots, pngA: opacity of the crisp image, dense: draw the
  // dense dot field, back: returning (image fades in, no dense fly-in) }.
  function viewState(elapsed, rawLt, towardLogo, reduce) {
    if (reduce) return { rv: 1, pm: 0, pngA: 1, dense: false, back: false };
    if (towardLogo && rawLt > 0 && isRevealed(elapsed)) {
      var a = returnAlpha(rawLt);
      return { rv: 0, pm: 1 - a, pngA: a, dense: false, back: true };
    }
    var rv = revealProgress(elapsed, rawLt), p = pngAlpha(rv);
    return { rv: rv, pm: dotsAlpha(rv), pngA: p, dense: rv > 0 && p < 1, back: false };
  }

  // Colours are bucketed (4 bits per channel) so a frame of dots draws in a few batches, with
  // steps too small to show as banding.
  var COLOR_KEYS = 4096;
  function colorKey(r, g, b) {
    return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
  }

  function keyRgb(key) {
    return [((key >> 8) & 15) * 16 + 8, ((key >> 4) & 15) * 16 + 8, (key & 15) * 16 + 8];
  }

  // How long the logo takes to dissolve into the dots at a morph speed (scenes per second),
  // plus a small margin; the page holds the next text panel back for this long.
  function leaveMs(speed) {
    return speed > 0 ? Math.round((LEAVE_SPAN / speed) * 1000) + 100 : 0;
  }

  // Recolours the grey wordmark (rows from textTop down) to rgb so it stays readable
  // on any theme. Gold and green pixels, and the shield rows, are left as they are.
  function tintWordmark(data, width, height, textTop, rgb) {
    for (var y = textTop; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var k = (y * width + x) * 4;
        if (!data[k + 3]) continue;
        if (Math.max(data[k], data[k + 1], data[k + 2]) - Math.min(data[k], data[k + 1], data[k + 2]) >= 45) continue;
        data[k] = rgb[0]; data[k + 1] = rgb[1]; data[k + 2] = rgb[2];
      }
    }
    return data;
  }

  window.TerminalLogoImage = {
    REVEAL_DELAY: REVEAL_DELAY, REVEAL_FADE: REVEAL_FADE, LEAVE_SPAN: LEAVE_SPAN, RETURN_SPAN: RETURN_SPAN,
    returnAlpha: returnAlpha, isRevealed: isRevealed,
    revealProgress: revealProgress, morphProgress: morphProgress, dotsAlpha: dotsAlpha, pngAlpha: pngAlpha,
    dotPhase: dotPhase, viewState: viewState, COLOR_KEYS: COLOR_KEYS, leaveMs: leaveMs, densePoints: densePoints, colorKey: colorKey, keyRgb: keyRgb, tintWordmark: tintWordmark
  };
})(window);

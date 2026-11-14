// Where a scene sits on the canvas, as fractions of its size. On wide screens
// text is on the left, so scenes sit right; on narrow ones the scene sits above
// the text. `free` is the height in px above the text (0 when unknown): on narrow
// screens scenes shrink and move up to fit inside it, so they never run under the
// text. The logo ignores `free` so its build-up keeps its own placement.
(function (window) {
  'use strict';

  var MIN_SCALE = 0.05;
  // Share of the free height a scene's scale may use: the twin spheres are round, while
  // the other scenes (lattice cube, device, globe) reach about 1.3x past their scale.
  var TWIN_FILL = 0.46;
  var SCENE_FILL = 0.36;

  function fit(cap, free, W, H, fill) {
    return {
      x: cap.x,
      y: Math.min(cap.y, (free * 0.5) / H),
      s: Math.max(MIN_SCALE, Math.min(cap.s, (free * fill) / Math.min(W, H)))
    };
  }

  function place(id, wide, free, W, H) {
    if (id === 'twin') {
      var cap = wide ? { x: 0.5, y: 0.25, s: 0.17 } : { x: 0.5, y: 0.27, s: 0.2 };
      return free ? fit(cap, free, W, H, TWIN_FILL) : cap;
    }
    var l = wide ? { x: 0.68, y: 0.5, s: 0.3 } : { x: 0.5, y: 0.3, s: 0.24 };
    if (id === 'globe' || id === 'languages') l.s *= 0.85;
    if (id === 'logo') l.s *= 0.83;
    return !wide && free && id !== 'logo' ? fit(l, free, W, H, SCENE_FILL) : l;
  }

  window.TerminalLayout = { place: place };
})(window);

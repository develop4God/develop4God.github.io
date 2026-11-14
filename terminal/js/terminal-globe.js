// Geometry of the globe scene: land and ocean dots from a 2-degree land mask, the continent
// colour bands, and the silhouette radius. Pure maths, no DOM. The scene itself takes the first
// N land cells; the canvas draws the extra land and the ocean as a layer of its own, so the
// point budget shared by all scenes stays untouched.
// y grows downward on screen, so the north pole is at -y.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  var RAD = Math.PI / 180;
  // The land map is turned by this many degrees of longitude (which longitude faces the camera at yaw 0).
  var LON_OFFSET = -70;
  // Land dots drawn on top of the scene's own, ocean dots, and dots on the silhouette ring.
  var LAND_EXTRA = 2400;
  var SEA_DOTS = 5000;
  var RING_DOTS = 260;
  // The camera sits at -z, so a dot is on the far side when its depth is above BACK_Z. The far side
  // is almost invisible so it does not muddle the near side.
  var BACK_Z = 0;
  var BACK_ALPHA = 0.06;
  // The globe is drawn orthographically (a camera this far away), like a flat map wrapped on a ball.
  var ORTHO_CAMERA = 1000;
  // Camera turn that faces the Atlantic, with the camera on the -z side: the mirror of looking from +z.
  var VIEW_YAW = 1.4;
  // Dot sizes as fractions of the sphere's on-screen radius, and ocean opacities.
  var DOT = { LAND: 0.0044, LAND_NEAR: 0.0032, LAND_FAR: 0.0022, SEA: 0.003, SEA_FAR: 0.0016, RING: 0.003 };
  var SEA_ALPHA = 0.5, SEA_BACK_ALPHA = 0.03;
  // Continent colour bands by longitude: the Americas, Europe and Africa, Asia and Oceania.
  var LON_AMERICAS_END = -30;
  var LON_AFRICA_END = 55;
  var COLS = 180, ROWS = 90;

  var cells = null, maskBin = null;

  function mask() {
    maskBin = maskBin || atob(window.TerminalWorldMask);
    return maskBin;
  }

  // Land cells sorted so the first n are an even-by-area sample of the land (high-latitude cells
  // are squeezed together on a sphere, so they get a lower chance of ranking early).
  function landCells() {
    if (cells) return cells;
    var bin = mask(), r = M.rng(33), list = [];
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      var b = y * COLS + x;
      if (!((bin.charCodeAt(b >> 3) >> (b & 7)) & 1)) continue;
      var w = Math.cos(((90 - (y + 0.5) * 2) * Math.PI) / 180);
      list.push({ lon: (x + r()) * 2 - 180, lat: 90 - (y + r()) * 2, k: Math.pow(r(), 1 / Math.max(w, 0.05)) });
    }
    list.sort(function (p, q) { return q.k - p.k; });
    cells = list;
    return cells;
  }

  function isLandAt(lon, lat) {
    var bin = mask(), cx = Math.min(COLS - 1, Math.floor((lon + 180) / 2)), cy = Math.min(ROWS - 1, Math.floor((90 - lat) / 2));
    var b = cy * COLS + cx;
    return ((bin.charCodeAt(b >> 3) >> (b & 7)) & 1) === 1;
  }

  // Point of longitude/latitude (degrees) on a sphere of radius rad. Fills out {x, y, z}.
  function surface(lonDeg, latDeg, rad, out) {
    var lon = (lonDeg + LON_OFFSET) * RAD, la = latDeg * RAD;
    out.x = Math.cos(la) * Math.sin(lon) * rad;
    out.y = -Math.sin(la) * rad;
    // The camera looks from -z, so z is flipped to keep east on the right of the near side.
    out.z = -Math.cos(la) * Math.cos(lon) * rad;
    return out;
  }

  // Colour band of a longitude: 0 = Americas, 1 = Europe and Africa, 2 = Asia and Oceania.
  function continent(lonDeg) {
    return lonDeg < LON_AMERICAS_END ? 0 : lonDeg < LON_AFRICA_END ? 1 : 2;
  }

  function checkCount(n, name) {
    if (!(n >= 0) || Math.floor(n) !== n) throw new RangeError('Invalid ' + name + ': ' + n);
  }

  // Land cells [from, from + count) of the sorted list as xyz triples on radius rad, and their
  // continent band. Calls with consecutive ranges never share a cell.
  function land(count, from, rad) {
    checkCount(count, 'land count');
    checkCount(from, 'land from');
    var all = landCells();
    if (from + count > all.length) throw new RangeError('Globe mask has fewer land cells than the ' + (from + count) + ' dots asked for');
    var pts = new Float32Array(count * 3), cls = new Uint8Array(count), p = {};
    for (var i = 0; i < count; i++) {
      var c = all[from + i];
      surface(c.lon, c.lat, rad, p);
      pts[i * 3] = p.x;
      pts[i * 3 + 1] = p.y;
      pts[i * 3 + 2] = p.z;
      cls[i] = continent(c.lon);
    }
    return { pts: pts, cls: cls };
  }

  // `count` ocean dots as xyz triples on radius rad, spread evenly by area and never on land.
  function sea(count, rad) {
    checkCount(count, 'sea count');
    var out = new Float32Array(count * 3), r = M.rng(77), p = {}, n = 0, tries = 0, limit = count * 50 + 1000;
    while (n < count) {
      if (++tries > limit) throw new Error('Could not place ' + count + ' ocean dots');
      var lon = r() * 360 - 180, lat = Math.asin(r() * 2 - 1) / RAD;
      if (isLandAt(lon, lat)) continue;
      surface(lon, lat, rad, p);
      out[n * 3] = p.x;
      out[n * 3 + 1] = p.y;
      out[n * 3 + 2] = p.z;
      n++;
    }
    return out;
  }

  function landCellCount() {
    return landCells().length;
  }

  // Camera distance for a given globe weight (0..1). The perspective amount is 1 / distance, so it is
  // eased in that amount: easing the distance itself would drop almost all perspective in the first few percent.
  function cameraFor(weight) {
    var w = M.clamp(weight, 0, 1), near = 1 / M.CAMERA, far = 1 / ORTHO_CAMERA;
    return 1 / (near + (far - near) * w);
  }

  // Opacity of a globe land dot: `lit` is the opacity of a lit dot, `mul` the fade of the whole globe.
  // Far-side dots almost vanish.
  function landAlpha(far, lit, mul) {
    return lit * (far ? BACK_ALPHA : 1) * mul;
  }

  // Radius of a globe land dot as a fraction of the sphere's on-screen radius. `z` is its depth (the camera
  // sits at -z) and `rad` the sphere radius. Near dots are bigger, far dots small.
  function landRadius(z, rad) {
    return z > BACK_Z ? DOT.LAND_FAR : DOT.LAND + DOT.LAND_NEAR * M.clamp(-z / rad, 0, 1);
  }

  // On-screen radius (in scene units, before the layout scale) of the silhouette of a sphere of
  // radius rad under the shared perspective camera (or the given camera distance).
  function limbRadius(rad, cam) {
    var d = cam || M.CAMERA;
    if (!(rad > 0 && rad < d)) throw new RangeError('Sphere radius out of range for the camera: ' + rad);
    return (rad * d) / Math.sqrt(d * d - rad * rad);
  }

  // How much of the globe layer shows between two scenes; `eased` is the eased morph position.
  function globeWeight(aId, bId, eased) {
    if (aId === 'globe' && bId === 'globe') return 1;
    return (aId === 'globe' ? 1 - eased : 0) + (bId === 'globe' ? eased : 0);
  }

  window.TerminalGlobe = {
    LON_OFFSET: LON_OFFSET, LAND_EXTRA: LAND_EXTRA, SEA_DOTS: SEA_DOTS, RING_DOTS: RING_DOTS, BACK_Z: BACK_Z, BACK_ALPHA: BACK_ALPHA,
    ORTHO_CAMERA: ORTHO_CAMERA, VIEW_YAW: VIEW_YAW, DOT: DOT, SEA_ALPHA: SEA_ALPHA, SEA_BACK_ALPHA: SEA_BACK_ALPHA,
    surface: surface, continent: continent, land: land, landCellCount: landCellCount, cameraFor: cameraFor, landRadius: landRadius, landAlpha: landAlpha, sea: sea, limbRadius: limbRadius, globeWeight: globeWeight
  };
})(window);

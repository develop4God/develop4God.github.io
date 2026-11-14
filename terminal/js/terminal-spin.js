// One calm spin shared by every sphere on the page (the fork spheres and the globe), so they
// all turn at the same speed and tilt toward the viewer by the same amount. Pure maths.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  // Radians per millisecond: one full turn in about 21 seconds.
  var RATE = 0.0003;
  // Radians the top of a sphere leans toward the viewer.
  var TILT = 0.38;

  // Spin angle (rad) at time t (ms) for a sphere started `phase` radians around, wrapped to
  // [-PI, PI] so it stays precise however long the page has been open.
  function angle(t, phase) {
    return M.wrapPi(t * RATE + (phase || 0));
  }

  window.TerminalSpin = { RATE: RATE, TILT: TILT, angle: angle };
})(window);

// Auto-playing story: shows one text panel at a time (the rest are inert so hidden
// links can't take focus) while the canvas morphs to the matching scene. Scenes
// advance on their own after a per-scene dwell, optionally looping; the dots are
// buttons to jump, and the timer stops while off-screen or when the visitor presses
// the pause control (hovering or focusing never freezes it).
// Under reduced motion the story is static and never advances.
(function (window) {
  'use strict';

  var M = window.TerminalMath;
  var MORPH_SPEED = 0.75; // scenes per second: one morph takes about 1.3s

  // opts: { story, panels, dots, reduce, dwell:[ms per scene], loop }
  function create(opts) {
    var story = opts.story, panels = opts.panels, dots = opts.dots, reduce = opts.reduce;
    var count = panels.length, current = 0, pos = 0, lastT = 0, timer = 0, visible = false, paused = false;

    function setActive(i) {
      current = i;
      panels.forEach(function (p, k) {
        var on = k === i;
        p.classList.toggle('on', on);
        p.setAttribute('aria-hidden', on ? 'false' : 'true');
        if (on) p.removeAttribute('inert'); else p.setAttribute('inert', '');
      });
      dots.forEach(function (d, k) {
        d.classList.toggle('on', k === i);
        d.setAttribute('aria-current', k === i ? 'true' : 'false');
      });
    }

    function dwellFor(i) {
      var d = opts.dwell || [];
      return d.length ? d[Math.min(i, d.length - 1)] : 6000;
    }

    function schedule() {
      clearTimeout(timer);
      if (reduce || !visible || paused) return;
      var d = dwellFor(current);
      if (!isFinite(d)) return;
      timer = setTimeout(function () {
        var n = M.nextIndex(current, count, opts.loop);
        if (n >= 0) goTo(n);
      }, d);
    }

    function goTo(i) {
      if (i < 0 || i >= count) return;
      setActive(i);
      schedule();
    }

    if (reduce) {
      story.classList.add('static');
      panels.forEach(function (p) { p.classList.add('on'); p.removeAttribute('inert'); p.setAttribute('aria-hidden', 'false'); });
      return { getProgress: function () { return 0; }, goTo: function () {}, advance: function () {}, setPaused: function () {}, isPaused: function () { return false; } };
    }

    setActive(0);
    dots.forEach(function (d, k) { d.addEventListener('click', function () { goTo(k); }); });
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; schedule(); }).observe(story);

    return {
      // Called every frame by the canvas: eases the scene position toward the
      // active scene at a fixed speed and returns it as 0..1 across all scenes.
      getProgress: function () {
        var now = performance.now();
        pos = M.stepToward(pos, current, lastT ? Math.min(now - lastT, 50) : 0, MORPH_SPEED);
        lastT = now;
        return count > 1 ? pos / (count - 1) : 0;
      },
      goTo: goTo,
      setPaused: function (v) { paused = !!v; schedule(); },
      isPaused: function () { return paused; },
      // Skips ahead one scene right away (used when the visitor scrolls, taps or presses a key).
      advance: function () { var n = M.nextIndex(current, count, false); if (n >= 0) goTo(n); }
    };
  }

  window.TerminalStory = { create: create };
})(window);

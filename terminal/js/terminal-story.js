// Pinned scroll story: turns scroll distance into 0..1 progress, shows exactly
// one text panel at a time (the rest are inert so hidden links can't take focus),
// and keeps the progress dots in sync. Under reduced motion the story is static.
(function (window) {
  'use strict';

  var M = window.TerminalMath;

  function create(opts) {
    var story = opts.story, pin = opts.pin, panels = opts.panels, dots = opts.dots, reduce = opts.reduce;
    var progress = 0, top = 0, travel = 1, visible = false, queued = false, current = -1;

    function setActive(i) {
      if (i === current) return;
      current = i;
      panels.forEach(function (p, k) {
        var on = k === i;
        p.classList.toggle('on', on);
        p.setAttribute('aria-hidden', on ? 'false' : 'true');
        if (on) p.removeAttribute('inert'); else p.setAttribute('inert', '');
      });
      dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
    }

    function measure() {
      top = parseFloat(getComputedStyle(pin).top) || 0;
      travel = story.offsetHeight - pin.offsetHeight;
    }

    function update() {
      queued = false;
      progress = M.pinProgress(top, story.getBoundingClientRect().top, travel);
      setActive(M.segment(progress, panels.length).active);
    }

    function schedule() {
      if (!visible || queued) return;
      queued = true;
      requestAnimationFrame(update);
    }

    if (reduce) {
      story.classList.add('static');
      panels.forEach(function (p) { p.classList.add('on'); p.removeAttribute('inert'); p.setAttribute('aria-hidden', 'false'); });
      return { getProgress: function () { return 0; } };
    }

    setActive(0);
    measure();
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) { measure(); update(); } }).observe(story);
    new ResizeObserver(function () { measure(); schedule(); }).observe(story);
    window.addEventListener('scroll', schedule, { passive: true });
    return { getProgress: function () { return progress; } };
  }

  window.TerminalStory = { create: create };
})(window);

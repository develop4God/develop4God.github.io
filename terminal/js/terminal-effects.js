// Small page interactions: typed terminal line, scroll reveal, the dot riding a
// line and stat count-up. Each respects reduced motion, and the
// final text is always in the DOM so nothing depends on the animation finishing.
(function (window) {
  'use strict';

  var M = window.TerminalMath;

  // Types a rotating list of phrases into `el`; pauses while off-screen.
  function typedLine(el, getPhrases, reduce) {
    var timer = 0, visible = false, gen = 0;

    function stop() { clearTimeout(timer); gen++; }

    function run() {
      var phrases = getPhrases();
      if (!phrases || !phrases.length) return;
      if (reduce) { el.textContent = phrases[0]; return; }
      var myGen = ++gen, idx = 0;
      (function phrase() {
        if (myGen !== gen) return;
        var s = phrases[idx % phrases.length], n = 0;
        (function type() {
          if (myGen !== gen) return;
          el.textContent = s.slice(0, n);
          if (n++ < s.length) timer = setTimeout(type, 45); else timer = setTimeout(erase, 1800);
        })();
        function erase() {
          var m = s.length;
          (function back() {
            if (myGen !== gen) return;
            el.textContent = s.slice(0, m);
            if (m-- > 0) timer = setTimeout(back, 22); else { idx++; phrase(); }
          })();
        }
      })();
    }

    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) run(); else stop();
    }).observe(el);
    return { restart: function () { stop(); if (visible || reduce) run(); } };
  }

  function reveal() {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    return {
      observe: function (els) {
        Array.prototype.forEach.call(els, function (el, i) { el.style.transitionDelay = (i % 4) * 60 + 'ms'; io.observe(el); });
      }
    };
  }

  // A dot travels down a line as you scroll; the step it passes lights up.
  function rideLine(ride) {
    var steps = ride.querySelectorAll('.step'), visible = false, queued = false;
    function update() {
      queued = false;
      var r = ride.getBoundingClientRect(), mid = window.innerHeight * 0.55;
      ride.style.setProperty('--r', M.clamp((mid - r.top) / Math.max(r.height, 1), 0, 1));
      steps.forEach(function (s) { var b = s.getBoundingClientRect(); s.classList.toggle('on', b.top < mid && b.bottom > mid - 40); });
    }
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) update(); }).observe(ride);
    window.addEventListener('scroll', function () { if (visible && !queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  }

  // Counts [data-countup] elements up from zero once visible. The element text at
  // that moment (set by AppStats) is the final value; non-numeric text is left alone.
  function countUp(els, reduce) {
    if (reduce) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var el = e.target, parsed = M.parseStat(el.textContent), start = performance.now();
        if (!parsed) return;
        (function tick(t) {
          var k = Math.min(1, (t - start) / 1100);
          el.textContent = M.formatStat(parsed.value * (1 - Math.pow(1 - k, 3)), parsed);
          if (k < 1) requestAnimationFrame(tick);
        })(start);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  window.TerminalEffects = { typedLine: typedLine, reveal: reveal, rideLine: rideLine, countUp: countUp };
})(window);

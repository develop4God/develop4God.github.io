// Page wiring for /terminal/: language and theme controls, path choice (Hire me /
// Ministry), lazy story creation, the cases list and shared footer.
(function (window) {
  'use strict';

  var I = window.TerminalI18n;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LOGO_URL = '/img/logo_vector_512x512.png';
  var PATHS = { hire: 'path-hire', ministry: 'path-ministry' };
  var dict = {}, dicts = {}, stories = {}, typed = null, langSeq = 0;
  var reveal = window.TerminalEffects.reveal();

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function scrollTo(el) { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function renderCases() {
    var host = $('#cases');
    // Rows already revealed stay revealed when the language changes.
    var shown = $all('.case', host).map(function (r) { return r.classList.contains('in'); });
    host.textContent = '';
    window.TerminalCases.forEach(function (c, idx) {
      var t = (dict.cases && dict.cases[c.id]) || {};
      var row = el(c.href ? 'a' : 'div', 'case rv' + (shown[idx] ? ' in' : ''));
      if (c.href) { row.href = c.href; row.target = '_blank'; row.rel = 'noopener'; }
      var left = el('div'), h = el('h3', '', t.name || c.name);
      if (t.chip) h.appendChild(el('span', 'chip', t.chip));
      left.appendChild(h);
      left.appendChild(el('p', '', t.desc || ''));
      var stack = el('div', 'stack');
      c.stack.forEach(function (s) { stack.appendChild(el('span', '', s)); });
      left.appendChild(stack);
      if (t.note) left.appendChild(el('div', 'note', t.note));
      var facts = el('ul', 'facts');
      (t.facts || []).forEach(function (f) { facts.appendChild(el('li', '', f)); });
      row.appendChild(left);
      row.appendChild(facts);
      host.appendChild(row);
    });
    reveal.observe($all('.case:not(.in)', host));
  }

  function renderFooter() {
    var f = dict.footer;
    if (!f || !window.SiteFooter) return;
    var year = new Date().getFullYear();
    window.SiteFooter.renderSharedLines($('#page-footer'), { copyright: f.copyright.replace(/©\s*\d{4}/, '© ' + year), madeWith: f.madeWith });
  }

  function labelPause(btn) {
    btn.setAttribute('aria-label', I.get(dict, btn.getAttribute('aria-pressed') === 'true' ? 'story.play' : 'story.pause') || btn.getAttribute('aria-label'));
  }

  function labelDots() {
    $all('.pause').forEach(labelPause);
    var word = I.get(dict, 'story.dot') || '';
    $all('.sdots').forEach(function (group) {
      $all('.dot', group).forEach(function (d, i) { d.setAttribute('aria-label', word + ' ' + (i + 1)); });
    });
  }

  function applyLanguage(l) {
    dict = dicts[l];
    I.apply(document, dict, l);
    $all('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === l ? 'true' : 'false'); });
    labelDots();
    renderCases();
    renderFooter();
    if (typed) typed.restart();
  }

  // Loads and applies a language. Only the most recent call wins, and the
  // choice is persisted only when that language was actually loaded.
  function setLanguage(l, persist) {
    var seq = ++langSeq;
    var ready = dicts[l] ? Promise.resolve({ lang: l, dict: dicts[l] }) : I.load(l);
    return ready.then(function (res) {
      if (seq !== langSeq) return;
      dicts[res.lang] = res.dict;
      if (persist && res.lang === l) { try { localStorage.setItem(I.STORAGE_KEY, l); } catch (e) { /* storage unavailable */ } }
      applyLanguage(res.lang);
    });
  }

  // Height in px above the fork text, so the canvas can fit the spheres into it.
  function freeAboveForkText(root) {
    var panel = $('.doorpanel', root), inner = panel && $('.in', panel);
    return inner ? Math.max(0, panel.offsetTop + inner.offsetTop - 20) : 0;
  }

  // The hero morphs slower than the other stories so the logo has time to dissolve.
  var HERO_MORPH_SPEED = 0.5;

  // The sphere matching a door reacts while the door is hovered with a mouse or keyboard-focused.
  // Touch never hovers, so a tap cannot leave a sphere stuck; it only sees the idle pulse.
  function wireDoorHints(canvas) {
    var TL = window.TerminalTwinLife;
    // The fork doors and the matching links in the header.
    var doors = $all('.door[data-path-link], .nl[data-path-link]').map(function (el) {
      return { el: el, sphere: TL.hintFor(el.getAttribute('data-path-link')), hover: false, focus: false };
    });
    function update() { canvas.setHint(TL.hotSphere(doors)); }
    doors.forEach(function (d) {
      d.el.addEventListener('pointerenter', function (e) { d.hover = TL.isMouse(e.pointerType); update(); });
      d.el.addEventListener('pointerleave', function () { d.hover = false; update(); });
      d.el.addEventListener('focus', function () { d.focus = d.el.matches(':focus-visible'); update(); });
      d.el.addEventListener('blur', function () { d.focus = false; update(); });
    });
  }

  function ensureStory(name) {
    if (stories[name]) return stories[name];
    var root = $('#story-' + name), pin = $('.pin', root);
    var dwell = (root.getAttribute('data-dwell') || '').split(',').filter(Boolean).map(Number);
    var ctrl = window.TerminalStory.create({
      story: root, panels: $all('[data-panel]', root), dots: $all('.sdots .dot', root), reduce: reduce, dwell: dwell, loop: root.hasAttribute('data-loop'),
      morphSpeed: name === 'hero' ? HERO_MORPH_SPEED : 0.75,
      // The door cards wait for the hero's logo to dissolve into the dots.
      panelDelay: name === 'hero' ? window.TerminalLogoImage.leaveMs(HERO_MORPH_SPEED) : 0
    });
    var canvas = window.TerminalCanvas.create({
      canvas: $('.scene', root), pin: pin, story: root, reduce: reduce, getProgress: ctrl.getProgress, getTarget: ctrl.getTarget,
      sceneIds: root.getAttribute('data-scenes').split(','), logoUrl: name === 'hero' ? LOGO_URL : null,
      getFree: name === 'hero' ? function () { return freeAboveForkText(root); } : null
    });
    if (name === 'hero') wireDoorHints(canvas);
    var pause = $('.pause', root);
    if (pause) {
      pause.addEventListener('click', function () {
        var on = pause.getAttribute('aria-pressed') !== 'true';
        pause.setAttribute('aria-pressed', on ? 'true' : 'false');
        ctrl.setPaused(on);
        labelPause(pause);
      });
    }
    stories[name] = ctrl;
    return ctrl;
  }

  // Any scroll, tap or navigation key skips the hero ahead to the fork right away.
  function skipHeroOnInput(hero) {
    var keys = { ArrowDown: 1, PageDown: 1, ' ': 1, Enter: 1 };
    function skip(e) {
      if (e.type === 'keydown' && !keys[e.key]) return;
      hero.advance();
    }
    ['wheel', 'touchstart', 'keydown'].forEach(function (type) { window.addEventListener(type, skip, { passive: true, once: false }); });
  }

  function showContact() {
    var c = $('#contact');
    c.hidden = false;
    return c;
  }

  function choosePath(name, noScroll) {
    if (!PATHS[name]) return;
    Object.keys(PATHS).forEach(function (k) { document.getElementById(PATHS[k]).hidden = k !== name; });
    document.body.setAttribute('data-path', name);
    $all('[data-path-link]').forEach(function (a) { if (a.classList.contains('nl')) a.setAttribute('aria-current', a.getAttribute('data-path-link') === name ? 'true' : 'false'); });
    showContact();
    ensureStory(name);
    history.replaceState(null, '', '#' + name);
    if (!noScroll) scrollTo($('#story-' + name));
  }

  function bindControls() {
    $all('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { setLanguage(b.getAttribute('data-lang'), true); }); });
    $('#theme').addEventListener('click', function () { window.TerminalTheme.set(window.TerminalTheme.nextTheme(window.TerminalTheme.current())); });
    $all('[data-path-link]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); choosePath(a.getAttribute('data-path-link')); }); });
    $all('[data-switch]').forEach(function (b) { b.addEventListener('click', function () { choosePath(b.getAttribute('data-switch')); }); });
    $all('[data-contact-link]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); scrollTo(showContact()); }); });
  }

  function init() {
    var param = new URLSearchParams(window.location.search).get('lang'), saved = null;
    try { saved = localStorage.getItem(I.STORAGE_KEY); } catch (e) { /* storage unavailable */ }
    var l = I.resolveLanguage({ param: param, saved: saved, browser: navigator.language });
    bindControls();
    skipHeroOnInput(ensureStory('hero'));
    var ride = $('#ride');
    window.TerminalEffects.rideLine(ride);
    reveal.observe($all('.rv'));
    window.TerminalEffects.countUp($all('[data-countup]'), reduce);
    setLanguage(l, false).then(function () {
      typed = window.TerminalEffects.typedLine($('[data-typed-text]'), function () { return I.get(dict, 'story.pipeline.phrases'); }, reduce);
      typed.restart();
      openHash();
    });
    window.addEventListener('hashchange', openHash);
    // The pinned stories and canvases are built once for the current motion
    // preference, so a change at runtime needs a fresh load.
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function () { window.location.reload(); });
  }

  // Opens the path or section named by the URL hash, scrolling to it.
  function openHash() {
    var hash = window.location.hash.slice(1);
    if (PATHS[hash]) choosePath(hash);
    else if (hash === 'contact') scrollTo(showContact());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);

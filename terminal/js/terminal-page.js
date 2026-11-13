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

  function applyLanguage(l) {
    dict = dicts[l];
    I.apply(document, dict, l);
    $all('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === l ? 'true' : 'false'); });
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

  function ensureStory(name) {
    if (stories[name]) return;
    var root = $('#story-' + name), pin = $('.pin', root);
    var ctrl = window.TerminalStory.create({ story: root, pin: pin, panels: $all('[data-panel]', root), dots: $all('.sdots i', root), reduce: reduce });
    window.TerminalCanvas.create({
      canvas: $('.scene', root), pin: pin, story: root, reduce: reduce, getProgress: ctrl.getProgress,
      sceneIds: root.getAttribute('data-scenes').split(','), logoUrl: name === 'hero' ? LOGO_URL : null
    });
    stories[name] = true;
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
    if (!noScroll) scrollTo(document.getElementById(PATHS[name]));
  }

  function bindControls() {
    $all('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { setLanguage(b.getAttribute('data-lang'), true); }); });
    $('#theme').addEventListener('click', function () { window.TerminalTheme.set(window.TerminalTheme.nextTheme(window.TerminalTheme.current())); });
    $all('[data-path-link]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); choosePath(a.getAttribute('data-path-link')); }); });
    $all('[data-switch]').forEach(function (b) { b.addEventListener('click', function () { choosePath(b.getAttribute('data-switch')); }); });
    $all('[data-contact-link]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); scrollTo(showContact()); }); });
    window.TerminalEffects.copyButton($('#copy'), $('#addr'), function () { return { copy: I.get(dict, 'contact.copy'), copied: I.get(dict, 'contact.copied') }; });
  }

  function init() {
    var param = new URLSearchParams(window.location.search).get('lang'), saved = null;
    try { saved = localStorage.getItem(I.STORAGE_KEY); } catch (e) { /* storage unavailable */ }
    var l = I.resolveLanguage({ param: param, saved: saved, browser: navigator.language });
    bindControls();
    ensureStory('hero');
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

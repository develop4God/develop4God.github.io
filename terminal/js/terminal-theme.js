// Light/dark theme for /terminal/. Shares the site's `theme` storage key and the
// `data-theme` attribute, and is loaded in <head> so the theme is set before first paint.
(function (window) {
  'use strict';

  var STORAGE_KEY = 'theme';

  function resolveTheme(saved, systemPrefersDark) {
    if (saved === 'light' || saved === 'dark') return saved;
    return systemPrefersDark ? 'dark' : 'light';
  }

  function nextTheme(current) {
    return current === 'light' ? 'dark' : 'light';
  }

  function readSaved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function set(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* storage unavailable: theme still applies */ }
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function init() {
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', resolveTheme(readSaved(), dark));
  }

  window.TerminalTheme = { resolveTheme: resolveTheme, nextTheme: nextTheme, set: set, current: current, init: init };
  if (typeof document !== 'undefined') init();
})(window);

// Theme switch of the Habitus+Faith pages: syncs the #theme-toggle checkbox and its sun/moon icons with
// data-theme (set early in <head>) and persists the choice under the shared 'theme' key.
(function () {
  'use strict';

  const toggle = document.getElementById('theme-toggle');

  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // The icons are looked up on every sync: lucide.createIcons() replaces the <i> placeholders with <svg>
  // nodes, so references taken at load time can point at detached elements.
  function syncSwitch() {
    const isDark = currentTheme() === 'dark';
    toggle.checked = isDark;
    toggle.parentElement.querySelector('.theme-icon-dark').classList.toggle('is-active', isDark);
    toggle.parentElement.querySelector('.theme-icon-light').classList.toggle('is-active', !isDark);
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      // Storage blocked (private mode): the theme still applies for this visit.
    }
  }

  toggle.addEventListener('change', () => {
    const next = toggle.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    saveTheme(next);
    syncSwitch();
  });

  // Runs after lucide.createIcons() (inline script below this one), so sync once the page is ready.
  window.addEventListener('load', syncSwitch);
  syncSwitch();
})();

(function (window) {
  'use strict';

  function pathFromScript() {
    var script = document.currentScript;
    if (!script) return '/data/app-stats.json';
    var scriptUrl = new URL(script.src, window.location.href);
    return new URL('../data/app-stats.json', scriptUrl).href;
  }

  function applyStats(stats) {
    document.querySelectorAll('[data-app-stat]').forEach(function (el) {
      var key = el.getAttribute('data-app-stat');
      if (Object.prototype.hasOwnProperty.call(stats, key)) {
        el.textContent = stats[key];
      }
    });
  }

  var statsPromise = null;

  function fetchStats() {
    if (!statsPromise) {
      statsPromise = fetch(pathFromScript()).then(function (response) {
        if (!response.ok) throw new Error('app-stats.json request failed');
        return response.json();
      });
    }
    return statsPromise;
  }

  function load() {
    fetchStats()
      .then(applyStats)
      .catch(function (error) {
        console.error('AppStats: failed to load stats', error);
      });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', load);
    } else {
      load();
    }
  }

  window.AppStats = { applyStats: applyStats, fetchStats: fetchStats };
})(window);

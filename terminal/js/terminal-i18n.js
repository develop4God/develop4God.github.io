// Language handling for /terminal/. Reuses the site-wide `develop4God_language`
// storage key and the `/lang/home/{lang}.json` footer strings; page copy lives in
// `/lang/terminal/{lang}.json`. v1 supports en and es; add a language by adding
// its code to SUPPORTED and a matching JSON file (a unit test enforces key parity).
(function (window) {
  'use strict';

  var SUPPORTED = ['en', 'es'];
  var DEFAULT_LANGUAGE = 'en';
  var STORAGE_KEY = 'develop4God_language';

  function normalize(value) {
    if (typeof value !== 'string') return null;
    var short = value.split('-')[0].toLowerCase();
    return SUPPORTED.indexOf(short) >= 0 ? short : null;
  }

  // First supported value among URL param, saved choice and browser language.
  function resolveLanguage(sources) {
    var order = [sources.param, sources.saved, sources.browser];
    for (var i = 0; i < order.length; i++) {
      var found = normalize(order[i]);
      if (found) return found;
    }
    return DEFAULT_LANGUAGE;
  }

  function get(dict, path) {
    var value = dict;
    var keys = path.split('.');
    for (var i = 0; i < keys.length; i++) {
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, keys[i])) {
        value = value[keys[i]];
      } else {
        return undefined;
      }
    }
    return value;
  }

  function fetchJson(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error('Failed to load ' + url);
      return response.json();
    });
  }

  // Loads page copy (required) and the shared footer strings (optional) and
  // resolves { lang, dict } where lang is the language actually loaded: if the
  // page copy fails, English is loaded once and reported as such.
  function load(lang) {
    return fetchJson('/lang/terminal/' + lang + '.json')
      .then(function (dict) {
        return fetchJson('/lang/home/' + lang + '.json')
          .then(function (home) { dict.footer = home.footer; })
          .catch(function (error) { console.error('TerminalI18n: footer strings unavailable for ' + lang, error); })
          .then(function () { return { lang: lang, dict: dict }; });
      })
      .catch(function (error) {
        console.error('TerminalI18n: failed to load ' + lang, error);
        if (lang !== DEFAULT_LANGUAGE) return load(DEFAULT_LANGUAGE);
        return { lang: DEFAULT_LANGUAGE, dict: {} };
      });
  }

  var TOKEN = /\{(\w+)\}/g;

  // Fills {name} placeholders from a values object (the app stats). A placeholder
  // without a value stays visible so callers can tell the string is unresolved.
  function interpolate(value, tokens) {
    if (typeof value !== 'string') return value;
    return value.replace(TOKEN, function (whole, name) {
      return tokens && Object.prototype.hasOwnProperty.call(tokens, name) ? String(tokens[name]) : whole;
    });
  }

  function isResolved(value) { return !/\{\w+\}/.test(value); }

  // Applies a dictionary to the DOM: data-i18n (text), data-i18n-aria (aria-label),
  // data-i18n-content (content attribute, for meta tags), plus <html lang> and title.
  // {name} placeholders are filled from `tokens`; a string that cannot be fully
  // resolved is skipped, so the page keeps its safe fallback text.
  function apply(root, dict, lang, tokens) {
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      var value = interpolate(get(dict, el.getAttribute('data-i18n')), tokens);
      if (typeof value === 'string' && isResolved(value)) el.textContent = value;
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var value = get(dict, el.getAttribute('data-i18n-aria'));
      if (typeof value === 'string') el.setAttribute('aria-label', value);
    });
    root.querySelectorAll('[data-i18n-content]').forEach(function (el) {
      var value = get(dict, el.getAttribute('data-i18n-content'));
      if (typeof value === 'string') el.setAttribute('content', value);
    });
    if (dict.meta && dict.meta.title) document.title = dict.meta.title;
    document.documentElement.setAttribute('lang', lang);
  }

  window.TerminalI18n = {
    SUPPORTED: SUPPORTED,
    DEFAULT_LANGUAGE: DEFAULT_LANGUAGE,
    STORAGE_KEY: STORAGE_KEY,
    resolveLanguage: resolveLanguage,
    get: get,
    interpolate: interpolate,
    load: load,
    apply: apply
  };
})(window);

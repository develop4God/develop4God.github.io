// Shared RTL/LTR direction helper for all i18n systems on the site
// (root js/home.js, devocionales/js/i18n.js). Single source of truth for
// which language codes are right-to-left, so adding a future RTL language
// (e.g. Hebrew, Urdu) is a one-line change here instead of a duplicated
// ternary in every section's i18n code.
(function (window) {
  'use strict';

  const RTL_LANGUAGES = ['ar'];

  function isRtl(langCode) {
    return RTL_LANGUAGES.includes(langCode);
  }

  function applyDirection(langCode) {
    document.documentElement.lang = langCode;
    document.documentElement.dir = isRtl(langCode) ? 'rtl' : 'ltr';
  }

  window.RtlHelper = { isRtl, applyDirection };
})(window);

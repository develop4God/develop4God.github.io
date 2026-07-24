/**
 * Thin adapter between devotional-loader.js and the site's i18n singleton
 * (window.i18n, from i18n.js). Exists so devotional-loader.js depends on a
 * small stable contract instead of reaching into the global directly —
 * absorbs the "has i18n finished its async init() yet" concern in one place.
 */
(function (global) {
    'use strict';

    function ready() {
        return !!(global.i18n && global.i18n.translations && Object.keys(global.i18n.translations).length);
    }

    // i18n.t() returns the raw key on a miss rather than throwing or
    // returning null, so a miss is detected by comparing the result to key.
    function t(key, fallback) {
        if (!ready()) return fallback;
        const value = global.i18n.t(key);
        return value === key ? fallback : value;
    }

    function getLanguage(supportedLanguages, defaultLang) {
        const lang = global.i18n && global.i18n.currentLang;
        return supportedLanguages.includes(lang) ? lang : defaultLang;
    }

    function onLanguageChanged(handler) {
        global.addEventListener('languageChanged', handler);
    }

    // i18n.js has no "init complete" event/promise today, so this polls
    // briefly — init() resolves after two awaited fetches, well under a
    // second in practice.
    function whenReady(callback) {
        if (ready()) {
            callback();
            return;
        }
        const intervalId = setInterval(() => {
            if (ready()) {
                clearInterval(intervalId);
                callback();
            }
        }, 30);
    }

    global.DevotionalI18n = { t, getLanguage, onLanguageChanged, whenReady };
})(window);

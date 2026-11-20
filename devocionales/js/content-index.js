(function (global) {
    'use strict';

    // Helpers shared by every content-index parser (Bible studies, Encounters): type guards,
    // reading minutes and per-language text with an explicit fallback language. Pure, no DOM.
    const DEFAULT_MINUTES = 5;

    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

    function readMinutes(map, lang) {
        if (!isObject(map)) return DEFAULT_MINUTES;
        const n = Number(map[lang]);
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_MINUTES;
    }

    // Exact language, then `fallbackLang` when given; never any other language.
    function pickLocalized(map, lang, fallbackLang) {
        if (!isObject(map)) return '';
        if (isNonEmptyString(map[lang])) return map[lang];
        return fallbackLang && isNonEmptyString(map[fallbackLang]) ? map[fallbackLang] : '';
    }

    global.ContentIndex = { isObject, isNonEmptyString, readMinutes, pickLocalized, DEFAULT_MINUTES };
})(window);

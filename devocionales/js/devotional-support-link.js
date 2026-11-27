(function (global) {
    'use strict';

    // The header's Donate button leads to /apoyanos/. That page is translated into these languages only,
    // so the button is hidden in every other one instead of sending the reader to a page they cannot read.
    // A unit test holds this list equal to the files in lang/apoyanos; add a code here when its file ships.
    const SUPPORT_LANGUAGES = ['es', 'en', 'pt', 'fr', 'de', 'ja', 'zh', 'hi', 'ar', 'fil'];

    // "hidden" and "flex" swap: the button is a flex row (icon + label) only while it is shown.
    function apply(button, lang) {
        if (!button) return;
        const show = SUPPORT_LANGUAGES.includes(lang);
        button.classList.toggle('hidden', !show);
        button.classList.toggle('flex', show);
    }

    global.DevotionalSupportLink = { apply, SUPPORT_LANGUAGES };
})(window);

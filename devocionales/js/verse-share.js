(function (global) {
    'use strict';

    // Shares one key verse from any reader (Bible studies or Encounters). Pure formatting plus a
    // thin call into ShareOrCopy, so the readers share one implementation and this file has no DOM.
    function buildVerseShareText(verse, { playStoreUrl }) {
        const reference = verse && verse.reference ? String(verse.reference) : '';
        const text = verse && verse.text ? String(verse.text) : '';
        if (!reference || !text) return '';
        return [`📖 *${reference}*`, `"${text}"`, '', playStoreUrl].join('\n');
    }

    function createVerseShare({ shareOrCopy, navigator, playStoreUrl, onOutcome = () => {} }) {
        return async function share(verse) {
            const text = buildVerseShareText(verse, { playStoreUrl });
            if (!text) return;
            const outcome = await shareOrCopy(navigator, { title: verse.reference, text });
            onOutcome(outcome);
        };
    }

    global.VerseShare = { buildVerseShareText, createVerseShare };
})(window);

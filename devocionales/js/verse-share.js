(function (global) {
    'use strict';

    // Shares one key verse from any reader (Bible studies or Encounters). Formatting is pure; the
    // share itself goes through ShareOrCopy, and this module decides the feedback (toast) so the
    // readers' boots only pass their own dependencies.
    function buildVerseShareText(verse, { playStoreUrl }) {
        const reference = verse && verse.reference ? String(verse.reference) : '';
        const text = verse && verse.text ? String(verse.text) : '';
        if (!reference || !text) return '';
        return [`📖 *${reference}*`, `"${text}"`, '', playStoreUrl].join('\n');
    }

    // messages: { copied, shareError } are the already-translated toast texts.
    function createVerseShare({ shareOrCopy, navigator, playStoreUrl, toast, messages }) {
        return async function share(verse) {
            const text = buildVerseShareText(verse, { playStoreUrl });
            if (!text) return;
            const outcome = await shareOrCopy(navigator, { title: verse.reference, text });
            if (outcome === 'copied') toast.show(messages.copied);
            if (outcome === 'failed') toast.show(messages.shareError, { kind: 'error' });
        };
    }

    global.VerseShare = { buildVerseShareText, createVerseShare };
})(window);

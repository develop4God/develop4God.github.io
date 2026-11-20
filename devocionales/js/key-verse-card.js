(function (global) {
    'use strict';

    // The key verse as a styled card, shared by the Bible-studies reader and the Encounters reader
    // (the web twin of the app's KeyVerseCard). Text goes through the builder's textContent, so
    // content can never become markup. The look lives in discovery.css, which both pages load.
    // The share button appears only when the reader injects `shareVerse`; the card never knows how
    // sharing works (that is verse-share.js).
    function createKeyVerseCard({ h, shareVerse = null, shareLabel = '' }) {
        function shareButton(verse) {
            if (typeof shareVerse !== 'function') return null;
            return h('button', {
                class: 'key-verse-card-share',
                text: shareLabel,
                attrs: { type: 'button', 'aria-label': shareLabel },
                on: { click: () => shareVerse(verse) },
            });
        }

        function build({ label, reference, text }) {
            const verse = { reference: reference || '', text: text || '' };
            return h('figure', { class: 'key-verse-card' }, [
                label ? h('figcaption', { class: 'key-verse-card-label', text: label }) : null,
                h('blockquote', { class: 'key-verse-card-text', text: verse.text }),
                h('p', { class: 'key-verse-card-ref', text: verse.reference }),
                shareButton(verse),
            ]);
        }

        return { build };
    }

    global.KeyVerseCard = { createKeyVerseCard };
})(window);

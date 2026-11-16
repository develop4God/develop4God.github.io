(function (global) {
    'use strict';

    // Generic "share it, or copy it" helper. Returns 'shared' | 'copied' | 'cancelled' | 'failed'
    // so callers decide the feedback (toast) without this file knowing about any UI.
    async function shareOrCopy(nav, payload) {
        const { title, text } = payload || {};
        if (!text) return 'failed';
        if (nav && typeof nav.share === 'function') {
            try {
                // text only: some targets append a provided `url` on top of text and duplicate the link.
                await nav.share({ title, text });
                return 'shared';
            } catch (err) {
                if (err && err.name === 'AbortError') return 'cancelled';
            }
        }
        try {
            await nav.clipboard.writeText(text);
            return 'copied';
        } catch (_) {
            return 'failed';
        }
    }

    global.ShareOrCopy = { shareOrCopy };
})(window);

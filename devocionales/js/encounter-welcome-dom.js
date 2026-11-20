(function (global) {
    'use strict';

    // First-visit welcome screen, mirroring EncounterWelcomePage in devocional_nuevo: full-screen
    // image, three headline lines (the last in gold), subtitle and a Begin button. Copy comes from
    // the app's `welcome_*` strings. Pure view code: the caller decides when to show it and what
    // Begin does. Escape dismisses it like Begin so keyboard users are never trapped.
    const TITLE_ID = 'encounter-welcome-title';

    function createWelcomeDom({ h, t, imageUrl }) {
        function buildWelcome({ onBegin }) {
            return h('section', {
                class: 'encounter-welcome',
                attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': TITLE_ID },
                on: { keydown: (e) => { if (e.key === 'Escape') onBegin(); } },
            }, [
                h('img', { class: 'encounter-welcome-image', attrs: { src: imageUrl, alt: '', 'aria-hidden': 'true' } }),
                h('div', { class: 'encounter-welcome-content' }, [
                    h('h2', { class: 'encounter-welcome-title', attrs: { id: TITLE_ID } }, [
                        h('span', { class: 'encounter-welcome-line', text: t('welcome_title_line1') }),
                        h('span', { class: 'encounter-welcome-line', text: t('welcome_title_line2') }),
                        h('span', { class: 'encounter-welcome-line encounter-welcome-line--gold', text: t('welcome_title_line3') }),
                    ]),
                    h('p', { class: 'encounter-welcome-subtitle', text: t('welcome_subtitle') }),
                    h('button', { class: 'encounter-welcome-begin', text: t('welcome_button'), attrs: { type: 'button' }, on: { click: () => onBegin() } }),
                ]),
            ]);
        }

        return { buildWelcome };
    }

    global.EncounterWelcomeDom = { createWelcomeDom };
})(window);

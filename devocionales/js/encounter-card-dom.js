(function (global) {
    'use strict';

    // DOM for one Encounters card. Pure view code: state comes from EncounterCards (open / completed /
    // locked / comingSoon), behaviour leaves through handlers, and every remote string is set as
    // text via the injected builder. Layout classes are the Bible-studies card's (`study-card*`) so
    // both lists look and behave alike; `encounter-*` classes only add what is specific.
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
    const BADGE_KEY = { completed: 'badge_completed', next: 'current' };

    function createCardDom({ h, t, imageUrlFor }) {
        const meta = (card) => [card.scripture, `${card.minutes} ${t('min_immersive_journey')}`].filter(Boolean).join(' · ');
        const hintOf = (card) => (card.prerequisiteTitle ? t('complete_to_unlock').replace('{title}', card.prerequisiteTitle) : '');

        function media(card) {
            const accentStyle = typeof card.accent === 'string' && HEX_COLOR.test(card.accent) ? `background-color:${card.accent}` : undefined;
            const picture = card.introImage ? h('picture', {}, [
                h('source', { attrs: { type: 'image/avif', srcset: imageUrlFor(card, 'avif') } }),
                h('img', {
                    attrs: { src: imageUrlFor(card, 'png'), alt: '', loading: 'lazy', decoding: 'async' },
                    on: { error: (e) => { e.target.hidden = true; } }, // a missing image never blocks reading (C4)
                }),
            ]) : null;
            return h('span', { class: 'encounter-card-media', attrs: { style: accentStyle } }, [
                h('span', { class: 'study-card-emoji', text: card.emoji, attrs: { 'aria-hidden': 'true' } }),
                picture,
            ]);
        }

        function body(card) {
            const hint = card.state === 'locked' ? hintOf(card) : '';
            return h('span', { class: 'study-card-body' }, [
                h('h3', { class: 'study-card-title', text: card.title }),
                card.subtitle ? h('p', { class: 'study-card-subtitle', text: card.subtitle }) : null,
                h('p', { class: 'study-card-meta', text: meta(card) }),
                hint ? h('p', { class: 'encounter-card-hint', text: hint }) : null,
                card.state === 'comingSoon' && card.releaseDate ? h('p', { class: 'encounter-card-release', text: card.releaseDate }) : null,
            ]);
        }

        function badge(card) {
            const text = card.state === 'comingSoon' ? t('coming_soon') : (BADGE_KEY[card.badge] ? t(BADGE_KEY[card.badge]) : '');
            return text ? h('span', { class: 'encounter-badge', text }) : null;
        }

        function openLabel(card) {
            const state = card.state === 'locked' ? [t('locked'), hintOf(card)] : [card.badge ? t(BADGE_KEY[card.badge]) : ''];
            return [card.title, card.subtitle, meta(card), ...state].filter(Boolean).join('. ');
        }

        function buildCard(card, { handlers }) {
            const classes = ['study-card', 'encounter-card', `encounter-card--${card.state === 'comingSoon' ? 'coming-soon' : card.state}`];
            if (card.isNextLocked) classes.push('encounter-card--next-locked');
            const attrs = { 'data-encounter-id': card.id };
            const inner = [media(card), body(card), card.state === 'locked' ? h('i', { attrs: { 'data-lucide': 'lock', 'aria-hidden': 'true' } }) : null, badge(card)];

            if (card.state === 'comingSoon') {
                return h('article', { class: classes.join(' '), attrs: { ...attrs, 'aria-disabled': 'true' } }, [h('div', { class: 'encounter-card-inner' }, inner)]);
            }
            const activate = card.state === 'locked' ? handlers.onLocked : handlers.onOpen;
            return h('article', { class: classes.join(' '), attrs }, [
                h('button', {
                    class: 'study-card-open',
                    attrs: { type: 'button', 'aria-label': openLabel(card) },
                    on: { click: () => activate(card.id) },
                }, inner),
            ]);
        }

        return { buildCard };
    }

    global.EncounterCardDom = { createCardDom };
})(window);

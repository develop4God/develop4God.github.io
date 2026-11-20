(function (global) {
    'use strict';

    // DOM for one study card and for the "Continue" hero. Pure view code: state comes in as a
    // card view-model (DiscoverySortFilter.buildCards), behaviour goes out through handlers, and
    // every remote string is set with textContent via the injected builder (E0).
    const BADGE_LABEL_KEY = { completed: 'badgeCompleted', new: 'badgeNew', inProgress: 'badgeCurrent' };
    const BADGE_CLASS = { completed: 'badge-completed', new: 'badge-new', inProgress: 'badge-current' };

    function createCardDom({ h, t }) {
        const meta = (card) => `${t('eyebrow')} · ${card.minutes} ${t('minutes')}`;
        const percentOf = (card) => (card.percent === null || card.percent === undefined ? null : Math.round(card.percent * 100));

        function progressBar(percent, className) {
            return h('div', {
                class: className,
                attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) },
            }, [h('span', { class: 'study-progress-fill', attrs: { style: `width:${percent}%` } })]);
        }

        function openLabel(card) {
            const parts = [card.title, card.subtitle, meta(card)];
            if (card.badge) parts.push(t(BADGE_LABEL_KEY[card.badge]));
            return parts.filter(Boolean).join('. ');
        }

        function confirmStrip(card, handlers) {
            return h('div', { class: 'study-confirm', attrs: { role: 'group', 'aria-label': t('removeConfirm') } }, [
                h('p', { text: t('removeConfirm') }),
                h('div', { class: 'study-confirm-actions' }, [
                    h('button', { class: 'study-confirm-yes', text: t('removeYes'), attrs: { type: 'button' }, on: { click: () => handlers.onConfirmRemove(card.id) } }),
                    h('button', { class: 'study-confirm-no', text: t('cancel'), attrs: { type: 'button' }, on: { click: () => handlers.onCancelRemove(card.id) } }),
                ]),
            ]);
        }

        function buildCard(card, { confirming = false, handlers }) {
            const percent = percentOf(card);
            return h('article', { class: 'study-card', attrs: { 'data-study-id': card.id } }, [
                h('button', {
                    class: 'study-card-open',
                    attrs: { type: 'button', 'aria-label': openLabel(card) },
                    on: { click: () => handlers.onOpen(card.id) },
                }, [
                    h('span', { class: 'study-card-emoji', text: card.emoji, attrs: { 'aria-hidden': 'true' } }),
                    h('span', { class: 'study-card-body' }, [
                        h('h3', { class: 'study-card-title', text: card.title }),
                        card.subtitle ? h('p', { class: 'study-card-subtitle', text: card.subtitle }) : null,
                        h('p', { class: 'study-card-meta', text: meta(card) }),
                        percent === null ? null : progressBar(percent, 'study-card-progress'),
                    ]),
                    card.badge ? h('span', { class: `study-badge ${BADGE_CLASS[card.badge]}`, text: t(BADGE_LABEL_KEY[card.badge]) }) : null,
                ]),
                h('div', { class: 'study-card-actions' }, [
                    h('button', {
                        class: 'study-fav',
                        attrs: { type: 'button', 'aria-pressed': String(card.isFavorite), 'aria-label': `${t('favorite')}: ${card.title}` },
                        on: { click: () => handlers.onToggleFavorite(card.id) },
                    }, [h('i', { attrs: { 'data-lucide': 'star', 'aria-hidden': 'true' } })]),
                    h('button', {
                        class: 'study-share',
                        attrs: { type: 'button', 'aria-label': `${t('share')}: ${card.title}` },
                        on: { click: () => handlers.onShare(card.id) },
                    }, [h('i', { attrs: { 'data-lucide': 'share-2', 'aria-hidden': 'true' } })]),
                ]),
                confirming ? confirmStrip(card, handlers) : null,
            ]);
        }

        return { buildCard, progressBar };
    }

    global.DiscoveryCardDom = { createCardDom };
})(window);

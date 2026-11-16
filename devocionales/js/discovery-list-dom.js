(function (global) {
    'use strict';

    // DOM for the studies list screen around the cards: filter chips, the grid, and the
    // loading / error / empty states. Card markup lives in discovery-card-dom.js (injected).
    const CHIPS = [
        { filter: 'all', labelKey: 'filterAll' },
        { filter: 'pending', labelKey: 'filterPending' },
        { filter: 'completed', labelKey: 'filterCompleted' },
        { filter: 'favorites', labelKey: 'filterFavorites' },
    ];

    function createListDom({ h, t, cardDom }) {
        function buildChips(counts, active, onSelect) {
            return h('div', { class: 'study-chips', attrs: { role: 'group', 'aria-label': t('title') } }, CHIPS.map(({ filter, labelKey }) => h('button', {
                class: 'study-chip',
                attrs: { type: 'button', 'data-filter': filter, 'aria-pressed': String(filter === active) },
                on: { click: () => onSelect(filter) },
            }, [
                h('span', { class: 'study-chip-label', text: t(labelKey) }),
                h('span', { class: 'study-chip-count', text: String(counts[filter]) }),
            ])));
        }

        function buildGrid(cards, { confirmingId = null, handlers }) {
            return h('div', { class: 'study-grid' }, cards.map((card) => cardDom.buildCard(card, { confirming: card.id === confirmingId, handlers })));
        }

        function buildMessage(kind, { onRetry } = {}) {
            switch (kind) {
                case 'loading':
                    return h('div', { class: 'study-message', attrs: { role: 'status' } }, [h('p', { text: t('loading') })]);
                case 'error':
                    return h('div', { class: 'study-message', attrs: { role: 'alert' } }, [
                        h('p', { text: t('loadError') }),
                        h('button', { class: 'study-retry', text: t('retry'), attrs: { type: 'button' }, on: { click: onRetry } }),
                    ]);
                case 'empty':
                    return h('div', { class: 'study-message' }, [h('p', { text: t('empty') })]);
                case 'filtered':
                    return h('div', { class: 'study-message' }, [h('p', { text: t('noneFound') })]);
                case 'favorites':
                    return h('div', { class: 'study-message' }, [
                        h('p', { class: 'study-message-title', text: t('noFavoritesTitle') }),
                        h('p', { text: t('noFavoritesDescription') }),
                    ]);
                default:
                    return null;
            }
        }

        const countLabel = (n) => t('studiesCount').replace('{count}', String(n));

        return { buildChips, buildGrid, buildMessage, countLabel };
    }

    global.DiscoveryListDom = { createListDom };
})(window);

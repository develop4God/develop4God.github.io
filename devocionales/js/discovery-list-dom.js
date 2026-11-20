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

    // Shared by Bible studies and Encounters. Labels and copy come in from the caller, so each page
    // supplies its own translation keys; this module owns only the markup.
    function createListDom({ h, t, cardDom }) {
        // items: [{ filter, label, count }]; the active one is pressed, a click reports its filter.
        function buildFilterChips(items, active, onSelect) {
            return h('div', { class: 'study-chips', attrs: { role: 'group', 'aria-label': t('title') } }, items.map(({ filter, label, count }) => h('button', {
                class: 'study-chip',
                attrs: { type: 'button', 'data-filter': filter, 'aria-pressed': String(filter === active) },
                on: { click: () => onSelect(filter) },
            }, [
                h('span', { class: 'study-chip-label', text: label }),
                h('span', { class: 'study-chip-count', text: String(count) }),
            ])));
        }

        function buildChips(counts, active, onSelect) {
            return buildFilterChips(CHIPS.map(({ filter, labelKey }) => ({ filter, label: t(labelKey), count: counts[filter] })), active, onSelect);
        }

        // The "Start here" / "Continue" hero. `label` and `buttonLabel` are already translated by the caller;
        // a percent (0-100) adds the progress bar, drawn by the card DOM so both screens share one bar.
        function buildHero({ label, buttonLabel, card, percent = null }, { onOpen }) {
            return h('section', { class: 'study-hero' }, [
                h('p', { class: 'study-hero-label', text: label }),
                h('div', { class: 'study-hero-main' }, [
                    h('span', { class: 'study-card-emoji', text: card.emoji, attrs: { 'aria-hidden': 'true' } }),
                    h('div', { class: 'study-hero-text' }, [
                        h('h2', { class: 'study-hero-title', text: card.title }),
                        card.subtitle ? h('p', { class: 'study-card-subtitle', text: card.subtitle }) : null,
                    ]),
                ]),
                percent === null ? null : h('div', { class: 'study-hero-progress' }, [
                    cardDom.progressBar(percent, 'study-hero-bar'),
                    h('span', { class: 'study-hero-percent', text: `${percent}%` }),
                ]),
                h('button', { class: 'study-hero-button', text: buttonLabel, attrs: { type: 'button' }, on: { click: () => onOpen(card.id) } }),
            ]);
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

        return { buildChips, buildFilterChips, buildHero, buildGrid, buildMessage, countLabel };
    }

    global.DiscoveryListDom = { createListDom };
})(window);

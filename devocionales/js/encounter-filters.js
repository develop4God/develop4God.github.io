(function (global) {
    'use strict';

    // List filter chips and the hero pick for the Encounters list, over the card view-models from
    // EncounterCards.buildCards. Pure functions, in their own file so a page holding an older cached
    // encounter-cards.js still has them.
    // Filter chips for the list. 'all' is every card in index order (coming-soon cards included, as before);
    // 'pending' = published and not completed; 'completed' = completed. Coming-soon cards only show under 'all'.
    const FILTERS = ['all', 'pending', 'completed'];
    const normalizeFilter = (value) => (FILTERS.includes(value) ? value : 'all');

    function filterCards(cards, filter) {
        switch (normalizeFilter(filter)) {
            case 'pending': return cards.filter((c) => c.state === 'open' || c.state === 'locked');
            case 'completed': return cards.filter((c) => c.state === 'completed');
            default: return cards.slice();
        }
    }

    function countFilters(cards) {
        return {
            all: cards.length,
            pending: filterCards(cards, 'pending').length,
            completed: filterCards(cards, 'completed').length,
        };
    }

    // The hero: an open encounter already in progress ("continue"), else the first open unfinished one ("start").
    // A locked card is never a hero.
    function pickHero(cards) {
        const inProgress = cards.find((c) => c.isInProgress && c.state === 'open');
        if (inProgress) return { card: inProgress, kind: 'continue' };
        const next = cards.find((c) => c.badge === 'next' && c.state === 'open');
        return next ? { card: next, kind: 'start' } : null;
    }

    global.EncounterFilters = { normalizeFilter, filterCards, countFilters, pickHero };
})(window);

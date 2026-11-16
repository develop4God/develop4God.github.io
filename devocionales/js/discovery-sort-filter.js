(function (global) {
    'use strict';

    // Pure list logic for the Bible-studies screen: badge priority, ordering,
    // filter chips and the "Continue" hero. No DOM and no storage access, so it
    // is fully unit-testable; callers inject seen/favourites/progress.
    const FILTERS = ['all', 'pending', 'completed', 'favorites'];

    const normalizeFilter = (value) => (FILTERS.includes(value) ? value : 'all');

    function toCard(study, { seen, favorites, progressOf, totals }) {
        const progress = progressOf ? progressOf(study.id) : null;
        const isCompleted = !!(progress && progress.isCompleted);
        const sections = progress && Array.isArray(progress.completedSections) ? progress.completedSections.length : 0;
        const isInProgress = !isCompleted && sections > 0;
        // "New" mirrors the app: not opened yet, and never once completed.
        const isNew = !isCompleted && !(seen && seen.has(study.id));
        const total = totals ? totals[study.id] : undefined;

        let percent = null;
        if (isCompleted) percent = 1;
        else if (total > 0) percent = Math.min(1, sections / total);

        let badge = null;
        if (isCompleted) badge = 'completed';
        else if (isNew) badge = 'new';
        else if (isInProgress) badge = 'inProgress';

        return {
            ...study,
            isCompleted,
            isInProgress,
            isNew,
            isFavorite: !!(favorites && favorites.has(study.id)),
            badge,
            percent,
        };
    }

    // Completed studies go last; Array.prototype.sort is stable, so index order is otherwise kept.
    function buildCards(studies, context = {}) {
        if (!Array.isArray(studies)) return [];
        return studies
            .map((s) => toCard(s, context))
            .sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted));
    }

    function filterCards(cards, filter) {
        switch (normalizeFilter(filter)) {
            case 'pending': return cards.filter((c) => !c.isCompleted);
            case 'completed': return cards.filter((c) => c.isCompleted);
            case 'favorites': return cards.filter((c) => c.isFavorite);
            default: return cards.slice();
        }
    }

    function countFilters(cards) {
        return {
            all: cards.length,
            pending: cards.filter((c) => !c.isCompleted).length,
            completed: cards.filter((c) => c.isCompleted).length,
            favorites: cards.filter((c) => c.isFavorite).length,
        };
    }

    function pickHero(cards) {
        if (!Array.isArray(cards)) return null;
        const inProgress = cards.find((c) => c.isInProgress);
        if (inProgress) return { card: inProgress, kind: 'continue' };
        const first = cards.find((c) => !c.isCompleted);
        return first ? { card: first, kind: 'start' } : null;
    }

    global.DiscoverySortFilter = { FILTERS, normalizeFilter, buildCards, filterCards, countFilters, pickHero };
})(window);

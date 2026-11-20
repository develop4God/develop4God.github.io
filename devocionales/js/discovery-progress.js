(function (global) {
    'use strict';

    // Section-progress rules shared by Bible studies and Encounters. Pure functions: no DOM, no storage.
    // Only card pages are sections; the key-verse page is not counted and never recorded.
    const sectionIndexes = (pages) => (Array.isArray(pages) ? pages.filter((p) => p && p.sectionIndex !== null).map((p) => p.sectionIndex) : []);

    const countSections = (pages) => sectionIndexes(pages).length;

    // Index of the first card page not yet read. Falls back to page 0 when nothing is read yet or every section is read.
    function firstUnreadIndex(pages, completedSections) {
        if (!Array.isArray(pages) || !pages.length) return 0;
        const done = new Set(completedSections || []);
        if (!done.size) return 0;
        const next = pages.findIndex((p) => p.sectionIndex !== null && !done.has(p.sectionIndex));
        return next === -1 ? 0 : next;
    }

    // True when every section of these pages was read. Compared by section index, never by count:
    // a record can hold indexes from a longer version of the content.
    function isFullyRead(pages, completedSections) {
        const indexes = sectionIndexes(pages);
        const done = new Set(completedSections || []);
        return indexes.length > 0 && indexes.every((i) => done.has(i));
    }

    // 0..1 for the progress bar, or null when there is no total to measure against. Completed is always full.
    function progressFraction({ isCompleted, sections, total }) {
        if (isCompleted) return 1;
        if (!(total > 0)) return null;
        return Math.min(1, sections / total);
    }

    // 0..1 fraction (or null) -> whole percent (or null), as the bar and the hero show it.
    const toPercent = (fraction) => (fraction === null || fraction === undefined ? null : Math.round(fraction * 100));

    // Copy and percent for the "Start here" / "Continue" hero. `labels` are already translated by the caller
    // (each page has its own translation keys); "Continue" shows the percentage, "Start here" none.
    function heroProps({ kind, card }, labels) {
        const isContinue = kind === 'continue';
        return {
            label: isContinue ? labels.continueWhereLeft : labels.startHere,
            buttonLabel: isContinue ? labels.continueBtn : labels.read,
            card,
            percent: isContinue ? toPercent(card.percent) : null,
        };
    }

    global.DiscoveryProgress = { countSections, firstUnreadIndex, isFullyRead, progressFraction, toPercent, heroProps };
})(window);

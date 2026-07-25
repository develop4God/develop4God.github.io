(function (global) {
    'use strict';

    // Prev/next archive navigation — a distinct concern from fetching/caching
    // year-files, extracted out of devotional-loader.js. Dependency-free like
    // bible-text-formatter.js/devotional-share.js: year-file access is passed
    // in rather than reached into directly, so this stays pure and testable.
    async function findAdjacentDate(dateKey, direction, { devotionalFileYear, loadYearFile, availableFileYears }) {
        const fileYear = devotionalFileYear(new Date(dateKey + 'T00:00:00'));
        const fileData = await loadYearFile(fileYear);
        const idx = fileData.sortedKeys.indexOf(dateKey);

        if (idx === -1) return null;

        const nextIdx = idx + direction;
        if (nextIdx >= 0 && nextIdx < fileData.sortedKeys.length) {
            return fileData.sortedKeys[nextIdx];
        }

        // Crossed a file boundary. Check index.json's published years first
        // (cheap, cached, no network round trip once loaded) so we don't
        // speculatively fetch — and 404 against — a year-file that's known
        // not to exist yet, e.g. checking "next" while on the newest
        // published year.
        const adjacentFileYear = fileYear + direction;
        const knownYears = await availableFileYears();
        if (knownYears && !knownYears.includes(adjacentFileYear)) return null;

        try {
            const adjacentData = await loadYearFile(adjacentFileYear);
            if (!adjacentData.sortedKeys.length) return null;
            return direction > 0 ? adjacentData.sortedKeys[0] : adjacentData.sortedKeys[adjacentData.sortedKeys.length - 1];
        } catch {
            return null;
        }
    }

    function setNavDisabled(prevDisabled, nextDisabled) {
        document.getElementById('nav-prev').disabled = prevDisabled;
        document.getElementById('nav-next').disabled = nextDisabled;
    }

    // Reflects the actual archive edges in the nav buttons right after a
    // load — without this, "prev" stayed clickable-but-inert on a visitor's
    // very first devotional (no earlier entry exists), and likewise "next"
    // at the newest published entry.
    async function updateNavAvailability(dateKey, deps) {
        const [prevDate, nextDate] = await Promise.all([
            findAdjacentDate(dateKey, -1, deps),
            findAdjacentDate(dateKey, 1, deps),
        ]);
        setNavDisabled(!prevDate, !nextDate);
    }

    global.DevotionalNav = { findAdjacentDate, setNavDisabled, updateNavAvailability };
})(window);

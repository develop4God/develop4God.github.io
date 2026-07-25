(function (global) {
    'use strict';

    const PROGRESS_KEY = 'devotionalProgress';

    function todayKey() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Devocionales-json splits content into "year files" that run Aug-Jul.
    // For a given calendar date, the covering file is named after the year
    // its August start falls in.
    function devotionalFileYear(date) {
        return date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
    }

    function daysBetween(a, b) {
        const msPerDay = 24 * 60 * 60 * 1000;
        return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / msPerDay);
    }

    function addDays(dateKey, days) {
        const d = new Date(dateKey + 'T00:00:00');
        d.setDate(d.getDate() + days);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function loadProgress() {
        try {
            return JSON.parse(localStorage.getItem(PROGRESS_KEY));
        } catch {
            return null;
        }
    }

    function saveProgress(startDate, firstVisitDate) {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify({ startDate, firstVisitDate }));
    }

    // A visitor's "today" is their own day-1 (earliest available devotional at
    // first visit) advanced by however many real calendar days have passed
    // since then — so nobody's progress starts stuck at the literal end of
    // the archive, but content still advances daily like a normal devotional.
    // findEarliestDate/findLatestDate are passed in rather than imported —
    // they depend on year-file fetching, which stays in devotional-loader.js.
    async function resolveDefaultDate({ findEarliestDate, findLatestDate }) {
        const progress = loadProgress();
        const calendarToday = todayKey();
        let target;

        if (progress) {
            const elapsed = daysBetween(progress.firstVisitDate, calendarToday);
            target = addDays(progress.startDate, Math.max(0, elapsed));
        } else {
            const earliest = await findEarliestDate();
            const startDate = earliest || calendarToday;
            saveProgress(startDate, calendarToday);
            target = startDate;
        }

        // Cap at the newest content actually available, in case a visitor's
        // progress has run ahead of what's been published.
        const latest = await findLatestDate();
        if (latest && target > latest) target = latest;
        return target;
    }

    global.DevotionalProgress = {
        todayKey,
        devotionalFileYear,
        daysBetween,
        addDays,
        loadProgress,
        saveProgress,
        resolveDefaultDate,
    };
})(window);

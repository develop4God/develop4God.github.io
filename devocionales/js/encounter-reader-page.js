(function (global) {
    'use strict';

    // Orchestrates the Encounters reader: loads one encounter, pages through its cards (key verse
    // first, like the app), records completion only from the completion card, and returns to the
    // list after the same 5 s the app waits. Pure orchestration: DOM, storage, network, timers and
    // i18n are injected, so every rule here is unit-tested without a browser.
    const RETURN_DELAY_MS = 5000;

    // Logical direction from a key: in RTL the arrows mirror (ArrowRight goes back).
    function directionFor(key, rtl) {
        if (key === 'ArrowRight') return rtl ? 'prev' : 'next';
        if (key === 'ArrowLeft') return rtl ? 'next' : 'prev';
        return null;
    }

    function createReaderPage(deps) {
        const { view, lang, data, store, timers, celebrate, onExit, copyright } = deps;

        let summary = null;
        let study = null;
        let pages = [];
        let index = 0;
        let loadSeq = 0;
        let completing = false; // press-once: set on the first completion, never cleared for this encounter

        // Single render path: the view receives the whole state and redraws from it.
        function render(extra = {}) {
            const isCompleted = !!summary && store.isCompleted(summary.id);
            view.render({
                summary,
                index,
                pages,
                footer: {
                    isCompleted,
                    copyright: study ? copyright(lang(), study.bible_version) : '',
                },
                notFound: false,
                error: false,
                ...extra,
            });
        }

        async function open(target) {
            const seq = ++loadSeq;
            summary = target;
            study = null;
            pages = [];
            index = 0;
            completing = false;
            try {
                const loaded = await data.loadEncounter(target, lang());
                if (seq !== loadSeq) return;
                const built = global.DiscoveryCards.buildPages(loaded);
                if (!built.length) {
                    render({ notFound: true });
                    return;
                }
                study = loaded;
                pages = built;
                render();
            } catch (_) {
                if (seq !== loadSeq) return;
                render({ error: true });
            }
        }

        function goTo(target) {
            if (!pages.length || target < 0 || target >= pages.length || target === index) return;
            index = target;
            render();
        }

        const next = () => goTo(index + 1);
        const prev = () => goTo(index - 1);

        // Only the completion card (the last page) can complete the encounter. A second press does nothing.
        function complete() {
            if (!summary || !pages.length || !pages[index].isLast) return;
            if (completing || store.isCompleted(summary.id)) return;
            completing = true;
            store.markCompleted(summary.id);
            celebrate();
            render();
            timers.setTimeout(() => onExit(), RETURN_DELAY_MS);
        }

        function exit() {
            onExit();
        }

        function onKey(key, { rtl = false } = {}) {
            const direction = directionFor(key, rtl);
            if (direction === 'next') next();
            else if (direction === 'prev') prev();
        }

        return { open, goTo, next, prev, complete, exit, onKey };
    }

    global.EncounterReaderPage = { createReaderPage, RETURN_DELAY_MS };
})(window);

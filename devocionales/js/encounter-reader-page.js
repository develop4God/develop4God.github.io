(function (global) {
    'use strict';

    // Orchestrates the Encounters reader: loads one encounter, pages through its cards (key verse
    // first, like the app), records completion only from the completion card, and returns to the
    // list after the same 5 s the app waits. Pure orchestration: DOM, storage, network, timers and
    // i18n are injected, so every rule here is unit-tested without a browser.
    const RETURN_DELAY_MS = 5000;

    function createReaderPage(deps) {
        const { view, lang, data, store, timers, celebrate, onExit, copyright } = deps;

        let summary = null;
        let study = null;
        let pages = [];
        let index = 0;
        let phase = 'intro'; // 'intro' (C0, shown on every open) -> 'reader'
        let intro = null;
        let loadSeq = 0;
        let completing = false; // press-once: set on the first completion, never cleared for this encounter
        let returnTimer = null; // the pending 5 s return to the list, cancelled whenever the reader moves on

        function cancelReturn() {
            if (returnTimer !== null) timers.clearTimeout(returnTimer);
            returnTimer = null;
        }

        // Single render path: the view receives the whole state and redraws from it.
        function render(extra = {}) {
            const isCompleted = !!summary && store.isCompleted(summary.id);
            view.render({
                summary,
                phase,
                intro,
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

        // Header fields for the intro screen, taken from the list entry (already localized by the loader).
        function introOf(entry) {
            return {
                id: entry.id,
                title: entry.title,
                subtitle: entry.subtitle || '',
                scripture: entry.scripture || '',
                minutes: entry.minutes,
                testament: entry.testament || '',
                emoji: entry.emoji,
                introImage: entry.introImage || '',
                accent: entry.accent || null,
                mood: entry.mood || '',
            };
        }

        function enter() {
            if (phase === 'reader' || !pages.length) return;
            phase = 'reader';
            index = 0;
            render();
        }

        async function open(target) {
            const seq = ++loadSeq;
            summary = target;
            study = null;
            pages = [];
            index = 0;
            phase = 'intro';
            intro = target ? introOf(target) : null;
            completing = false;
            cancelReturn();
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

        // Swipe support: whether a page exists in that direction (paging only happens in the reader).
        const canGo = (dir) => phase === 'reader' && pages.length > 0 && (dir === 'next' ? index < pages.length - 1 : index > 0);

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
            returnTimer = timers.setTimeout(() => { returnTimer = null; onExit(); }, RETURN_DELAY_MS);
        }

        function exit() {
            cancelReturn();
            onExit();
        }

        // Drops the current encounter (a not-found or other route took over the page): nothing pages,
        // nothing returns, and a late load for it is ignored.
        function reset() {
            loadSeq += 1;
            cancelReturn();
            summary = null;
            study = null;
            pages = [];
            index = 0;
            phase = 'intro';
            intro = null;
            completing = false;
        }

        // Paging keys belong to the reader; during the intro they do nothing.
        function onKey(key, { rtl = false } = {}) {
            if (phase !== 'reader') return;
            const action = global.DiscoveryNav.keyAction(key, { rtl });
            if (action === 'next') next();
            else if (action === 'prev') prev();
        }

        return { open, enter, goTo, next, prev, canGo, complete, exit, reset, onKey };
    }

    global.EncounterReaderPage = { createReaderPage, RETURN_DELAY_MS };
})(window);

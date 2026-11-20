(function (global) {
    'use strict';

    // Orchestrates the Encounters list. Owns no markup, storage format or lock rule: the data
    // loader, store, card view-model, DOM builders, unlock sheet and navigation are all injected, so
    // this file only wires state -> view and taps -> collaborators.
    function createListPage(deps) {
        const { view, lang, data, store, cards, listDom, unlockSheet, onOpen, header = null, progress = null } = deps;
        const FILTER_SESSION_KEY = 'encounterFilter';
        const CHIP_KEYS = [['all', 'filterAll'], ['pending', 'filterPending'], ['completed', 'filterCompleted']];

        let entries = [];
        let loaded = false;
        let loadSeq = 0;
        let previousStates = null; // id -> state of the last render, to spot cards that just opened
        let filter = readFilter();

        const afterRender = () => { if (deps.afterRender) deps.afterRender(); };
        const allUnlocked = () => (deps.allUnlocked ? !!deps.allUnlocked() : false);
        // The hero and chips are optional: a page cached before they existed has no containers, and then only the grid renders.
        const hasHeader = () => !!(header && view.hero && view.chips);

        function readFilter() {
            if (!header) return 'all';
            try { return header.filters.normalizeFilter(deps.sessionStorage.getItem(FILTER_SESSION_KEY)); } catch (_) { return 'all'; }
        }

        function saveFilter() {
            try { deps.sessionStorage.setItem(FILTER_SESSION_KEY, filter); } catch (_) { /* the session choice is a convenience only */ }
        }

        function showMessage(kind) {
            view.count.textContent = '';
            if (hasHeader()) { view.hero.replaceChildren(); view.chips.replaceChildren(); }
            view.body.replaceChildren(listDom.buildMessage(kind, { onRetry: reload }));
            afterRender();
        }

        // Hero (the next encounter to read) and filter chips, built from the full list so the counts are never filtered.
        function renderHeader(list) {
            if (!hasHeader()) return;
            const hero = header.filters.pickHero(list);
            const copy = header.labels(); // read at render time so a language switch is reflected
            view.hero.replaceChildren(...(hero ? [header.dom.buildHero(header.heroProps(hero, copy), { onOpen: (id) => onOpen(id) })] : []));
            const counts = header.filters.countFilters(list);
            const items = CHIP_KEYS.map(([key, labelKey]) => ({ filter: key, label: copy[labelKey], count: counts[key] }));
            view.chips.replaceChildren(header.dom.buildFilterChips(items, filter, setFilter, copy.groupLabel));
        }

        const handlers = { onOpen: (id) => onOpen(id), onLocked: () => unlockSheet.open() };

        function render() {
            if (!entries.length) { showMessage('empty'); return; }
            const list = cards.buildCards(entries, {
                completed: store.loadCompleted(),
                allUnlocked: allUnlocked(),
                progressOf: (id) => (progress ? progress.getProgress(id) : null),
            });
            view.count.textContent = listDom.countLabel(cards.countPublished(entries));
            renderHeader(list);
            // Without the chips a saved filter could not be cleared: an older cached page always shows everything.
            const visible = hasHeader() ? header.filters.filterCards(list, filter) : list;
            view.body.replaceChildren(visible.length ? listDom.buildGrid(visible, { handlers }) : listDom.buildMessage('filtered'));
            // A card that was locked and is open now plays the unlock once (the CSS respects reduced motion).
            // One card gets the flash and its pill; several (unlock all) get a staggered sweep and no pill.
            if (previousStates) {
                const opened = list.filter((c) => previousStates[c.id] === 'locked' && c.state === 'open');
                const single = opened.length === 1;
                opened.forEach((c) => {
                    const el = view.body.querySelector(`[data-encounter-id="${c.id}"]`);
                    if (!el) return;
                    if (single) {
                        el.classList.add('is-just-unlocked');
                        el.setAttribute('data-unlock-label', deps.unlockLabel || '');
                    } else {
                        el.classList.add('is-bulk-unlocked');
                    }
                });
            }
            previousStates = Object.fromEntries(list.map((c) => [c.id, c.state]));
            afterRender();
        }

        // Re-rendering replaces the chips, which drops keyboard focus: keep it on the chip that now shows the choice.
        function setFilter(next) {
            const doc = view.chips.ownerDocument;
            const hadFocus = !!(doc && view.chips.contains(doc.activeElement));
            filter = header.filters.normalizeFilter(next);
            saveFilter();
            render();
            if (hadFocus) {
                const chosen = view.chips.querySelector(`[data-filter="${filter}"]`);
                if (chosen) chosen.focus();
            }
        }

        // A reload supersedes any load still in flight (rapid language switches): only the newest result renders.
        async function reload() {
            const seq = ++loadSeq;
            loaded = false;
            previousStates = null;
            showMessage('loading');
            try {
                const result = await data.loadIndex(lang());
                if (seq !== loadSeq) return;
                entries = result;
                loaded = true;
                render();
            } catch (_) {
                if (seq !== loadSeq) return;
                showMessage('error');
            }
        }

        // Re-render from the store (progress changed in the reader or another tab); a no-op until the index is loaded.
        function refresh() {
            if (loaded) render();
        }

        return { init: reload, reload, refresh };
    }

    global.EncounterListPage = { createListPage };
})(window);

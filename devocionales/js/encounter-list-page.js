(function (global) {
    'use strict';

    // Orchestrates the Encounters list. Owns no markup, storage format or lock rule: the data
    // loader, store, card view-model, DOM builders, unlock sheet and navigation are all injected, so
    // this file only wires state -> view and taps -> collaborators.
    function createListPage(deps) {
        const { view, lang, data, store, cards, listDom, unlockSheet, onOpen, labels = {}, progress = null } = deps;
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
        const hasHeader = () => !!(view.hero && view.chips);

        function readFilter() {
            try { return cards.normalizeFilter(deps.sessionStorage.getItem(FILTER_SESSION_KEY)); } catch (_) { return 'all'; }
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

        // The shared hero: "Continue" for an encounter in progress (with its percentage), else "Start here".
        function heroProps({ kind, card }) {
            const isContinue = kind === 'continue';
            return {
                label: isContinue ? labels.continueWhereLeft : labels.startHere,
                buttonLabel: isContinue ? labels.continueBtn : labels.read,
                card,
                percent: isContinue && card.percent !== null && card.percent !== undefined ? Math.round(card.percent * 100) : null,
            };
        }

        // Hero (the next encounter to read) and filter chips, built from the full list so the counts are never filtered.
        function renderHeader(list) {
            if (!hasHeader()) return;
            const hero = cards.pickHero(list);
            view.hero.replaceChildren(...(hero ? [listDom.buildHero(heroProps(hero), { onOpen: (id) => onOpen(id) })] : []));
            const counts = cards.countFilters(list);
            const items = CHIP_KEYS.map(([key, labelKey]) => ({ filter: key, label: labels[labelKey], count: counts[key] }));
            view.chips.replaceChildren(listDom.buildFilterChips(items, filter, setFilter));
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
            const visible = cards.filterCards(list, hasHeader() ? filter : 'all');
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
            filter = cards.normalizeFilter(next);
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

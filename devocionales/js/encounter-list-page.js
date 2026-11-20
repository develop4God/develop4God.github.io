(function (global) {
    'use strict';

    // Orchestrates the Encounters list. Owns no markup, storage format or lock rule: the data
    // loader, store, card view-model, DOM builders, unlock sheet and navigation are all injected, so
    // this file only wires state -> view and taps -> collaborators.
    function createListPage(deps) {
        const { view, lang, data, store, cards, listDom, unlockSheet, onOpen } = deps;

        let entries = [];
        let loaded = false;
        let loadSeq = 0;
        let previousStates = null; // id -> state of the last render, to spot cards that just opened

        const afterRender = () => { if (deps.afterRender) deps.afterRender(); };
        const allUnlocked = () => (deps.allUnlocked ? !!deps.allUnlocked() : false);

        function showMessage(kind) {
            view.count.textContent = '';
            view.body.replaceChildren(listDom.buildMessage(kind, { onRetry: reload }));
            afterRender();
        }

        const handlers = { onOpen: (id) => onOpen(id), onLocked: () => unlockSheet.open() };

        function render() {
            if (!entries.length) { showMessage('empty'); return; }
            const list = cards.buildCards(entries, { completed: store.loadCompleted(), allUnlocked: allUnlocked() });
            view.count.textContent = listDom.countLabel(cards.countPublished(entries));
            view.body.replaceChildren(listDom.buildGrid(list, { handlers }));
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

(function (global) {
    'use strict';

    // Orchestrates the Bible-studies list screen. It owns no markup, storage format or business
    // rule: every collaborator is injected (data, store, sort/filter, DOM builders, toast, share),
    // so this file only wires state -> view and user actions -> collaborators.
    const FILTER_SESSION_KEY = 'discoveryFilter';

    function createListPage(deps) {
        const { view, h, t, lang, data, store, sortFilter, shareText, shareOrCopy, toast, onOpen } = deps;
        const cardDom = deps.cardDomFactory({ h, t });
        const listDom = deps.listDomFactory({ h, t, cardDom });

        let studies = [];
        let loaded = false;
        let confirmingId = null;
        let loadSeq = 0;
        let filter = readFilter();

        function readFilter() {
            try { return sortFilter.normalizeFilter(deps.sessionStorage.getItem(FILTER_SESSION_KEY)); } catch (_) { return 'all'; }
        }

        function saveFilter() {
            try { deps.sessionStorage.setItem(FILTER_SESSION_KEY, filter); } catch (_) { /* session choice is a convenience only */ }
        }

        const afterRender = () => { if (deps.afterRender) deps.afterRender(); };

        function showMessage(kind) {
            view.count.textContent = '';
            view.hero.replaceChildren();
            view.chips.replaceChildren();
            view.body.replaceChildren(listDom.buildMessage(kind, { onRetry: reload }));
            afterRender();
        }

        const handlers = {
            onOpen: openStudy,
            onToggleFavorite: toggleFavorite,
            onShare: share,
            onConfirmRemove: confirmRemove,
            onCancelRemove: (id) => {
                confirmingId = null;
                focusRequest = { selector: `[data-study-id="${id}"] .study-fav`, root: view.body };
                render();
            },
        };

        // Whole-view re-renders destroy the focused control; remember it and focus its replacement
        // (keyboard and screen-reader users must not be dropped back to <body> after every action).
        const FOCUS_CLASSES = ['study-fav', 'study-share', 'study-card-open', 'study-hero-button'];
        let focusRequest = null;

        function ancestorWith(el, attr) {
            for (let node = el; node; node = node.parentElement) if (node.getAttribute && node.getAttribute(attr) !== null) return node;
            return null;
        }

        function currentFocus() {
            const active = view.body.ownerDocument.activeElement;
            if (!active || !active.getAttribute) return null;
            const filterChip = ancestorWith(active, 'data-filter');
            if (filterChip && view.chips.contains && view.chips.contains(filterChip)) return { selector: `[data-filter="${filterChip.getAttribute('data-filter')}"]`, root: view.chips };
            const card = ancestorWith(active, 'data-study-id');
            const cls = FOCUS_CLASSES.find((c) => active.classList.contains(c));
            if (card && cls) return { selector: `[data-study-id="${card.getAttribute('data-study-id')}"] .${cls}`, root: view.body };
            return null;
        }

        function restoreFocus(request) {
            const target = request && request.root.querySelector(request.selector);
            if (target) target.focus();
        }

        function render() {
            const request = focusRequest || currentFocus();
            focusRequest = null;
            renderView();
            restoreFocus(request);
        }

        function renderView() {
            if (!studies.length) { showMessage('empty'); return; }
            const language = lang();
            const cards = sortFilter.buildCards(studies, {
                seen: store.loadSeen(),
                favorites: store.loadFavorites(language),
                progressOf: (id) => store.getProgress(id, language),
            });
            const hero = sortFilter.pickHero(cards);
            const visible = sortFilter.filterCards(cards, filter);

            view.count.textContent = listDom.countLabel(studies.length);
            view.hero.replaceChildren(...(hero ? [listDom.buildHero(heroProps(hero), { onOpen: openStudy })] : []));
            view.chips.replaceChildren(listDom.buildChips(sortFilter.countFilters(cards), filter, setFilter));
            view.body.replaceChildren(visible.length
                ? listDom.buildGrid(visible, { confirmingId, handlers })
                : listDom.buildMessage(filter === 'favorites' ? 'favorites' : 'filtered'));
            afterRender();
        }

        // Studies-specific copy and progress for the shared hero: "Continue" shows the percentage, "Start here" none.
        function heroProps({ kind, card }) {
            const isContinue = kind === 'continue';
            const percent = isContinue && card.percent !== null && card.percent !== undefined ? Math.round(card.percent * 100) : null;
            return { label: t(isContinue ? 'continueWhereLeft' : 'startHere'), buttonLabel: t(isContinue ? 'continueBtn' : 'read'), card, percent };
        }

        function setFilter(next) {
            filter = sortFilter.normalizeFilter(next);
            confirmingId = null;
            saveFilter();
            render();
        }

        function openStudy(id) {
            store.markSeen(id);
            onOpen(id);
        }

        function toggleFavorite(id) {
            if (store.loadFavorites(lang()).has(id)) {
                confirmingId = id; // removing asks first (B9)
                focusRequest = { selector: `[data-study-id="${id}"] .study-confirm-yes`, root: view.body };
                render();
                return;
            }
            if (store.toggleFavorite(id, lang())) toast.show(t('addedFavorite'));
            render();
        }

        function confirmRemove(id) {
            confirmingId = null;
            store.toggleFavorite(id, lang());
            toast.show(t('removedFavorite'));
            focusRequest = { selector: `[data-study-id="${id}"] .study-fav`, root: view.body };
            render();
        }

        async function share(id) {
            const summary = studies.find((s) => s.id === id);
            const language = lang(); // one value for the whole share, even if the language changes meanwhile
            try {
                const study = await data.loadStudy(summary, language);
                const text = shareText.buildStudyShareText(study, {
                    eyebrow: t('eyebrow'), revelation: t('revelation'), reflectionQuestions: t('reflectionQuestions'),
                    footerDownload: t('shareFooterDownload'), footerBenefits: t('shareFooterBenefits'), footerDeveloper: t('shareFooterDeveloper'),
                }, deps.playStoreUrl);
                const outcome = await shareOrCopy(deps.navigator, { title: summary.title, text });
                if (outcome === 'copied') toast.show(t('copied'));
                if (outcome === 'failed') toast.show(t('shareError'), { kind: 'error' });
            } catch (_) {
                toast.show(t('shareError'), { kind: 'error' });
            }
        }

        // A reload supersedes any load still in flight (rapid language switches): only the newest result renders.
        async function reload() {
            const seq = ++loadSeq;
            confirmingId = null;
            loaded = false;
            showMessage('loading');
            try {
                const result = await data.loadIndex(lang());
                if (seq !== loadSeq) return;
                studies = result;
                loaded = true;
                render();
            } catch (_) {
                if (seq !== loadSeq) return;
                showMessage('error');
            }
        }

        // Re-render from the stores (another tab changed favourites, seen or progress); a no-op until the index is loaded.
        function refresh() {
            if (loaded) render();
        }

        return { init: reload, reload, refresh };
    }

    global.DiscoveryListPage = { createListPage };
})(window);

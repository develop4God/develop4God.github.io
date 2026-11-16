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
            onCancelRemove: () => { confirmingId = null; render(); },
        };

        function render() {
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
            view.hero.replaceChildren(...(hero ? [cardDom.buildHero(hero, { onOpen: openStudy })] : []));
            view.chips.replaceChildren(listDom.buildChips(sortFilter.countFilters(cards), filter, setFilter));
            view.body.replaceChildren(visible.length
                ? listDom.buildGrid(visible, { confirmingId, handlers })
                : listDom.buildMessage(filter === 'favorites' ? 'favorites' : 'filtered'));
            afterRender();
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
            render();
        }

        async function share(id) {
            const summary = studies.find((s) => s.id === id);
            try {
                const study = await data.loadStudy(summary, lang());
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
            showMessage('loading');
            try {
                const loaded = await data.loadIndex(lang());
                if (seq !== loadSeq) return;
                studies = loaded;
                render();
            } catch (_) {
                if (seq !== loadSeq) return;
                showMessage('error');
            }
        }

        return { init: reload, reload };
    }

    global.DiscoveryListPage = { createListPage };
})(window);

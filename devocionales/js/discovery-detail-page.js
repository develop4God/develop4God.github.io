(function (global) {
    'use strict';

    // Orchestrates the Bible-study reader: loads a study, pages through its cards, records
    // progress and completion. Collaborators are injected (data, store, DOM builders, nav
    // helpers, copyright, toast), so this file only wires state -> view and actions -> store.
    function createDetailPage(deps) {
        const { view, t, lang, rtl, data, store, nav, copyright, toast, celebrate, onExit } = deps;
        const detailDom = deps.detailDomFactory({ h: deps.h, t, shareVerse: deps.shareVerse });
        const { listDom } = deps;

        let study = null;
        let summary = null;
        let pages = [];
        let index = 0;
        let loadSeq = 0;

        function scrollToTop() {
            if (deps.scrollToTop) deps.scrollToTop();
        }

        function showMessage(kind) {
            view.root.replaceChildren(listDom.buildMessage(kind, { onRetry: () => open(summary) }));
        }

        // Reading a card counts as completing that section; only card pages have a section index.
        function recordView() {
            const page = pages[index];
            if (page && page.sectionIndex !== null) store.markSectionCompleted(summary.id, page.sectionIndex, lang());
        }

        function firstUnreadPage() {
            const done = new Set(store.getProgress(summary.id, lang()).completedSections);
            if (!done.size) return 0;
            const next = pages.findIndex((p) => p.sectionIndex !== null && !done.has(p.sectionIndex));
            return next === -1 ? 0 : next;
        }

        // slide: 'next' | 'prev' when the page changed, so the new page enters from that side.
        function render({ focusPage = false, slide = null } = {}) {
            const page = pages[index];
            const pageEl = detailDom.buildPage(page);
            pageEl.setAttribute('tabindex', '-1');
            if (slide) pageEl.classList.add(`slide-in-${slide}`);
            const isCompleted = store.getProgress(summary.id, lang()).isCompleted;
            view.root.replaceChildren(
                detailDom.buildHeader({ emoji: summary.emoji, title: summary.title, subtitle: summary.subtitle }),
                detailDom.buildProgress(pages.length, index, summary.title, { onSelect: goTo }),
                ...(index === 0 && !store.hasSeenSwipeHint() ? [detailDom.buildSwipeHint()] : []),
                pageEl,
                ...(page.isLast ? [detailDom.buildFooter({
                    isCompleted,
                    copyright: copyright.resolve(lang(), study.version),
                    onComplete: complete,
                })] : []),
                detailDom.buildNav({ index, total: pages.length, onPrev: prev, onNext: next, onExit }),
            );
            if (focusPage) pageEl.focus({ preventScroll: true }); // goTo scrolls itself; completing must not scroll the button out of view
        }

        function goTo(target) {
            if (!study || !pages.length || target < 0 || target >= pages.length || target === index) return;
            const slide = target > index ? 'next' : 'prev';
            index = target;
            store.markSwipeHintSeen(); // the reader has paged: the hint has done its job
            recordView();
            render({ focusPage: true, slide });
            scrollToTop();
        }

        const canGo = (dir) => pages.length > 0 && (dir === 'next' ? index < pages.length - 1 : index > 0);

        const next = () => goTo(index + 1);
        const prev = () => goTo(index - 1);

        function complete() {
            if (store.getProgress(summary.id, lang()).isCompleted) return;
            store.completeStudy(summary.id, lang());
            toast.show(t('studyCompleted'));
            if (celebrate) celebrate.burst();
            render({ focusPage: true }); // the button that had focus was replaced; keep the reader's place
            const done = view.root.querySelector('.reader-complete');
            if (done) done.classList.add('is-just-done'); // only this button plays the done animation
        }

        async function open(target) {
            const seq = ++loadSeq;
            summary = target;
            study = null;
            pages = []; // keys and swipes must not page a previous study while this one loads
            showMessage('loading');
            try {
                const loaded = await data.loadStudy(target, lang());
                if (seq !== loadSeq) return;
                const built = global.DiscoveryCards.buildPages(loaded);
                if (!built.length) { showNotFound(); return; }
                study = loaded;
                pages = built;
                store.markSeen(target.id);
                store.setTotalSections(target.id, pages.filter((p) => p.sectionIndex !== null).length, lang());
                index = firstUnreadPage();
                recordView();
                render();
                scrollToTop();
            } catch (_) {
                if (seq === loadSeq) showMessage('error');
            }
        }

        function showNotFound() {
            loadSeq += 1; // a late load must not replace this message
            pages = [];
            view.root.replaceChildren(detailDom.buildNotFound({ onBack: onExit }));
        }

        const onKey = (key) => {
            const action = nav.keyAction(key, { rtl: rtl() });
            if (action === 'next') next(); else if (action === 'prev') prev();
        };

        return { open, goTo, next, prev, canGo, onKey, showNotFound };
    }

    global.DiscoveryDetailPage = { createDetailPage };
})(window);

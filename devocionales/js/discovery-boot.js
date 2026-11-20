(function (global) {
    'use strict';

    // Composition root of the Bible-studies page (list + reader): the only place that touches the
    // real DOM, storage, network, history and i18n singletons and hands them to the (unit-tested)
    // modules. Verified end to end by e2e/discovery-studies.spec.js and e2e/discovery-detail.spec.js.
    const DATA_BASE_URL = 'https://raw.githubusercontent.com/develop4God/Devocionales-json/refs/heads/main/discovery';
    const CACHE_NAME = 'discovery-studies-v1';

    function boot() {
        const doc = global.document;
        // The installed app has its own bottom bar: DevotionalStandalone hides the links back to the site (is-standalone).
        if (global.DevotionalStandalone) global.DevotionalStandalone.apply(doc, global);
        // The installed app's bottom bar (Home / Studies / Settings); a no-op in a browser tab and on Android.
        if (global.DevotionalShell) global.DevotionalShell.init(doc, global, global.DevotionalPwaConfig);
        const i18n = global.DevotionalI18n;
        const supported = Object.keys(global.i18n.supportedLanguages);
        const lang = () => i18n.getLanguage(supported, 'en');
        const rtl = () => doc.documentElement.dir === 'rtl';
        // 'retry' reuses the reader's existing string instead of duplicating it under discovery.*
        const t = (key) => (key === 'retry' ? i18n.t('devotionals.errorRetry', '') : i18n.t(`discovery.${key}`, ''));

        const byId = (id) => doc.getElementById(id);
        const listView = byId('studies-list-view');
        const detailView = byId('studies-detail-view');
        const h = global.DomBuilder.createBuilder(doc);
        const store = global.DiscoveryStore.createDiscoveryStore(global.localStorage);
        const toast = global.UiToast.createToast({ document: doc, container: doc.body });
        // A page cached before verse-share.js was added has no VerseShare: the share button then does nothing.
        const verseShare = global.VerseShare ? global.VerseShare.createVerseShare({
            shareOrCopy: global.ShareOrCopy.shareOrCopy,
            navigator: global.navigator,
            playStoreUrl: global.DevotionalShare.PLAY_STORE_URL,
            onOutcome: (outcome) => {
                if (outcome === 'copied') toast.show(t('copied'));
                if (outcome === 'failed') toast.show(t('shareError'), { kind: 'error' });
            },
        }) : { share: () => {} };
        const celebrate = global.UiCelebration.createCelebration({
            h,
            container: doc.body,
            reducedMotion: () => global.matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        const data = global.DiscoveryData.createDiscoveryData({
            fetchWithRetry: global.DevotionalFetch.fetchWithRetry,
            cache: global.DiscoveryCache.createCacheStore(global.caches, CACHE_NAME),
            baseUrl: DATA_BASE_URL,
        });
        const cardDom = global.DiscoveryCardDom.createCardDom({ h, t });
        const listDom = global.DiscoveryListDom.createListDom({ h, t, cardDom });
        const renderIcons = () => global.lucide.createIcons();

        let router = null;

        const listPage = global.DiscoveryListPage.createListPage({
            view: { count: byId('studies-count'), hero: byId('studies-hero'), chips: byId('studies-chips'), body: byId('studies-body') },
            h,
            t,
            lang,
            data,
            store,
            sessionStorage: global.sessionStorage,
            sortFilter: global.DiscoverySortFilter,
            cardDomFactory: global.DiscoveryCardDom.createCardDom,
            listDomFactory: global.DiscoveryListDom.createListDom,
            shareText: global.DiscoveryShareText,
            playStoreUrl: global.DevotionalShare.PLAY_STORE_URL,
            shareOrCopy: global.ShareOrCopy.shareOrCopy,
            navigator: global.navigator,
            toast,
            afterRender: renderIcons,
            onOpen: (id) => router.open(id),
        });

        const detailPage = global.DiscoveryDetailPage.createDetailPage({
            view: { root: detailView },
            h,
            t,
            lang,
            rtl,
            data,
            store,
            detailDomFactory: global.DiscoveryDetailDom.createDetailDom,
            shareVerse: verseShare.share,
            listDom,
            nav: global.DiscoveryNav,
            copyright: global.DiscoveryCopyright.createCopyright({ versionInfo: global.DevotionalVersion.versionInfo }),
            toast,
            celebrate,
            onExit: () => router.close(),
            scrollToTop: () => global.scrollTo(0, 0),
        });

        function applyStaticText() {
            doc.title = `${t('title')} - Devocionales Cristianos`;
            byId('studies-title').textContent = t('title');
            byId('studies-nav').setAttribute('aria-label', i18n.t('shell.nav_label', 'Main navigation'));
        }

        function showList() {
            detailView.hidden = true;
            listView.hidden = false;
            // Coming back from a study: progress, seen and favourites may have changed.
            if (listView.dataset.loaded) listPage.refresh(); else { listView.dataset.loaded = '1'; listPage.init(); }
        }

        async function showDetail(studyId) {
            listView.hidden = true;
            detailView.hidden = false;
            try {
                const studies = await data.loadIndex(lang());
                const summary = studies.find((s) => s.id === studyId);
                if (router.current() !== studyId) return; // the user navigated away while the index loaded
                if (summary) await detailPage.open(summary); else detailPage.showNotFound();
            } catch (_) {
                detailPage.showNotFound();
            }
            renderIcons();
        }

        router = global.DiscoveryRouter.createRouter({ win: global, nav: global.DiscoveryNav, onList: showList, onDetail: showDetail });

        applyStaticText();
        i18n.onLanguageChanged(() => {
            applyStaticText();
            if (router.current()) router.refresh(); else listPage.reload();
        });
        // Another tab changed favourites / seen / progress: redraw from storage. A language change elsewhere: reload.
        global.addEventListener('storage', (e) => {
            if (e.key === 'develop4God_language') global.location.reload();
            else if (!router.current() && (e.key === null || e.key.startsWith('discovery_'))) listPage.refresh(); // null: storage cleared elsewhere
        });
        // Coming back through the back/forward cache must show the latest progress.
        global.addEventListener('pageshow', (e) => { if (e.persisted && !router.current()) listPage.refresh(); });

        // Paging by keyboard and swipe, only while a study is open.
        doc.addEventListener('keydown', (e) => {
            const modified = e.altKey || e.ctrlKey || e.metaKey || e.shiftKey;
            if (router.current() && !modified && !e.defaultPrevented && !global.DiscoveryNav.isTypingTarget(e.target)) detailPage.onKey(e.key);
        });
        const swipe = global.UiSwipeDrag.createSwipeDrag({
            classify: (delta) => global.DiscoveryNav.classifySwipe(delta, { rtl: rtl() }),
            getTarget: () => detailView.querySelector('.study-page'),
            rtl,
            canGo: detailPage.canGo,
            onCommit: (dir) => (dir === 'next' ? detailPage.next() : detailPage.prev()),
        });
        const point = (e) => e.changedTouches[0];
        detailView.addEventListener('touchstart', (e) => { if (e.changedTouches.length === 1) swipe.start(point(e).clientX, point(e).clientY); else swipe.cancel(); }, { passive: true });
        detailView.addEventListener('touchmove', (e) => { if (e.changedTouches.length === 1) swipe.move(point(e).clientX, point(e).clientY); else swipe.cancel(); }, { passive: true });
        detailView.addEventListener('touchcancel', () => swipe.cancel(), { passive: true });
        detailView.addEventListener('touchend', (e) => {
            if (e.changedTouches.length !== 1) { swipe.cancel(); return; } // a second finger (pinch) is never a swipe
            swipe.end(point(e).clientX, point(e).clientY);
        }, { passive: true });

        router.start();
        renderIcons();
    }

    global.DevotionalI18n.whenReady(boot);
})(window);

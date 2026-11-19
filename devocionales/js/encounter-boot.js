(function (global) {
    'use strict';

    // Composition root of the Encounters page: the only place that touches the real DOM, storage,
    // network and i18n singletons and hands them to the (unit-tested) modules. Verified end to end
    // by e2e/encounters.spec.js.
    const DATA_BASE_URL = 'https://raw.githubusercontent.com/develop4God/Devocionales-json/refs/heads/main/encounters';
    const IMAGE_BASE_URL = 'https://raw.githubusercontent.com/develop4God/Devocionales-assets/main/images/encounters';
    const WELCOME_IMAGE = '/devocionales/img/encounters-welcome.webp';
    const CACHE_NAME = 'encounters-v1';
    // The shared list DOM asks for studies-flavoured keys; they map onto the app's `encounters.*` strings.
    const KEY_ALIASES = { loadError: 'error_load', empty: 'empty_title', studiesCount: 'count' };
    const INERT_SELECTOR = 'header, main, footer, #shell-nav';

    function boot() {
        const doc = global.document;
        if (global.DevotionalStandalone) global.DevotionalStandalone.apply(doc, global);
        if (global.DevotionalShell) global.DevotionalShell.init(doc, global, global.DevotionalPwaConfig);
        const i18n = global.DevotionalI18n;
        const supported = Object.keys(global.i18n.supportedLanguages);
        const lang = () => i18n.getLanguage(supported, 'en');
        const t = (key) => i18n.t(`encounters.${KEY_ALIASES[key] || key}`, '');

        const byId = (id) => doc.getElementById(id);
        const h = global.DomBuilder.createBuilder(doc);
        const store = global.EncounterStore.createEncounterStore(global.localStorage);
        const renderIcons = () => global.lucide.createIcons();
        const setBackgroundInert = (on) => doc.querySelectorAll(INERT_SELECTOR).forEach((el) => el.toggleAttribute('inert', on));

        const data = global.EncounterData.createEncounterData({
            fetchWithRetry: global.DevotionalFetch.fetchWithRetry,
            cache: global.DiscoveryCache.createCacheStore(global.caches, CACHE_NAME),
            baseUrl: DATA_BASE_URL,
        });
        const images = global.EncounterImages.createImageUrls(IMAGE_BASE_URL);
        const cardDom = global.EncounterCardDom.createCardDom({ h, t, imageUrlFor: images.cardImageUrl });
        const listDom = global.DiscoveryListDom.createListDom({ h, t, cardDom });
        const unlockSheet = global.EncounterUnlockSheetDom.createUnlockSheet({
            h,
            t,
            container: doc.body,
            playStoreUrl: global.DevotionalShare.PLAY_STORE_URL,
            showPlayLink: !global.DevotionalIosHint.isIos(global.navigator), // no Android app to open on iOS
            setBackgroundInert,
            focusFallback: () => { const title = byId('encounters-title'); title.setAttribute('tabindex', '-1'); title.focus(); },
        });

        const listView = byId('encounters-list-view');
        const detailView = byId('encounters-detail-view');
        const celebration = global.UiCelebration.createCelebration({
            h,
            container: doc.body,
            reducedMotion: () => global.matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        const rtl = () => doc.documentElement.dir === 'rtl';

        // Route state lives in the URL (?id=), owned by the Bible-studies router with the Encounters
        // nav helpers (same URL grammar). Declared first: the list's open handler calls it.
        let router = null;
        let readerView = null;
        const reader = global.EncounterReaderPage.createReaderPage({
            view: { render: (state) => readerView.render(state) },
            lang,
            data: { loadEncounter: (entry, language) => data.loadStudy(entry, language) },
            store,
            timers: { setTimeout: (fn, ms) => global.setTimeout(fn, ms) },
            celebrate: () => celebration.burst(),
            onExit: () => router.close(),
            copyright: (language, bibleVersion) => global.DiscoveryCopyright.createCopyright({
                versionInfo: global.DevotionalVersion.versionInfo,
            }).resolve(language, bibleVersion),
        });
        readerView = global.EncounterReaderView.createReaderView({
            dom: global.EncounterReaderDom.createReaderDom({ h, t, imageUrlFor: images.imageUrl }),
            root: detailView,
            listView,
            detailView,
            actions: reader,
        });

        // The deep link decides what shows: the lock rule is applied on the card list, not here.
        async function showDeepLink(id) {
            let entries;
            try {
                entries = await data.loadIndex(lang());
            } catch (_) {
                readerView.showList(); // the list shows its own error with Retry
                return;
            }
            const cards = global.EncounterCards.buildCards(entries, { completed: store.loadCompleted(), allUnlocked: false });
            const route = global.EncounterRoute.routeFor(cards, id);
            if (route.kind === 'open') {
                readerView.showReader();
                reader.open(route.entry);
            } else if (route.kind === 'locked') {
                reader.reset();
                readerView.showList();
                unlockSheet.open();
            } else {
                reader.reset();
                readerView.showReader();
                readerView.render({ notFound: true, summary: { id }, phase: 'intro', intro: null, pages: [], index: 0, footer: {} });
            }
        }

        const listPage = global.EncounterListPage.createListPage({
            view: { count: byId('encounters-count'), body: byId('encounters-body') },
            lang,
            data,
            store,
            cards: global.EncounterCards,
            listDom,
            unlockSheet,
            allUnlocked: () => false,
            afterRender: renderIcons,
            onOpen: (id) => router.open(id),
        });

        router = global.DiscoveryRouter.createRouter({
            win: global,
            nav: global.DiscoveryNav,
            // Back to the list: redraw from storage so a just-completed encounter shows as done and the next one opens (B6).
            onList: () => { reader.reset(); readerView.showList(); listPage.refresh(); },
            onDetail: (id) => { showDeepLink(id); },
        });

        function applyStaticText() {
            doc.title = `${t('section_title')} - Devocionales Cristianos`;
            byId('encounters-title').textContent = t('section_title');
            byId('encounters-nav').setAttribute('aria-label', i18n.t('shell.nav_label', 'Main navigation'));
        }

        // First visit only (the app's encounter_welcome_seen): Begin or Escape marks it seen for good.
        function showWelcomeOnce() {
            if (store.hasSeenWelcome()) return;
            const welcome = global.EncounterWelcomeDom.createWelcomeDom({ h, t, imageUrl: WELCOME_IMAGE }).buildWelcome({ onBegin: dismiss });
            function dismiss() {
                if (!welcome.parentElement) return;
                welcome.remove();
                store.markWelcomeSeen();
                setBackgroundInert(false);
                const title = byId('encounters-title');
                title.setAttribute('tabindex', '-1');
                title.focus();
            }
            doc.body.append(welcome);
            setBackgroundInert(true);
            welcome.querySelector('.encounter-welcome-begin').focus();
        }

        applyStaticText();
        i18n.onLanguageChanged(() => { applyStaticText(); listPage.reload(); });
        // Another tab changed progress: redraw from storage. A language change elsewhere: reload.
        global.addEventListener('storage', (e) => {
            if (e.key === 'develop4God_language') global.location.reload();
            else if (e.key === null || e.key.startsWith('develop4God_encounters_')) listPage.refresh(); // null: storage cleared elsewhere
        });
        // Coming back through the back/forward cache must show the latest progress.
        global.addEventListener('pageshow', (e) => { if (e.persisted) listPage.refresh(); });

        // Paging by keyboard and swipe, only while the reader shows a page.
        doc.addEventListener('keydown', (e) => {
            const modified = e.altKey || e.ctrlKey || e.metaKey || e.shiftKey;
            if (!detailView.hidden && !modified && !e.defaultPrevented && !global.DiscoveryNav.isTypingTarget(e.target)) reader.onKey(e.key, { rtl: rtl() });
        });
        const swipe = global.UiSwipeDrag.createSwipeDrag({
            classify: (delta) => global.DiscoveryNav.classifySwipe(delta, { rtl: rtl() }),
            getTarget: () => detailView.querySelector('.encounter-page'),
            rtl,
            canGo: reader.canGo,
            onCommit: (dir) => (dir === 'next' ? reader.next() : reader.prev()),
        });
        const point = (e) => e.changedTouches[0];
        detailView.addEventListener('touchstart', (e) => { if (e.changedTouches.length === 1) swipe.start(point(e).clientX, point(e).clientY); else swipe.cancel(); }, { passive: true });
        detailView.addEventListener('touchmove', (e) => { if (e.changedTouches.length === 1) swipe.move(point(e).clientX, point(e).clientY); else swipe.cancel(); }, { passive: true });
        detailView.addEventListener('touchcancel', () => swipe.cancel(), { passive: true });
        detailView.addEventListener('touchend', (e) => {
            if (e.changedTouches.length !== 1) { swipe.cancel(); return; } // a second finger (pinch) is never a swipe
            swipe.end(point(e).clientX, point(e).clientY);
        }, { passive: true });

        listPage.init();
        router.start();
        showWelcomeOnce();
        renderIcons();
    }

    global.DevotionalI18n.whenReady(boot);
})(window);

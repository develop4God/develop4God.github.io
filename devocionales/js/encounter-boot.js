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
    const PASS_AUTO_CLOSE_MS = 6500;

    function boot() {
        const doc = global.document;
        if (global.DevotionalStandalone) global.DevotionalStandalone.apply(doc, global);
        if (global.DevotionalShell) global.DevotionalShell.init(doc, global, global.DevotionalPwaConfig);
        const i18n = global.DevotionalI18n;
        const supported = Object.keys(global.i18n.supportedLanguages);
        const lang = () => i18n.getLanguage(supported, 'en');
        // Keys the Encounters namespace lacks (the shared list copy: "none found", "title") come from the Bible-studies namespace.
        const t = (key) => i18n.t(`encounters.${KEY_ALIASES[key] || key}`, '') || i18n.t(`discovery.${key}`, '');

        const byId = (id) => doc.getElementById(id);
        const h = global.DomBuilder.createBuilder(doc);
        const store = global.EncounterStore.createEncounterStore(global.localStorage);
        // A page cached before the entitlement script existed reads every encounter as locked.
        const entitlement = global.EncounterEntitlement ? global.EncounterEntitlement.createEncounterEntitlement(global.localStorage) : null;
        const isUnlockedAll = () => (entitlement ? entitlement.isUnlocked() : false);
        // A page cached before ui-toast.js was added has no toast: messages are then skipped, not thrown.
        const toast = global.UiToast ? global.UiToast.createToast({ document: doc, container: doc.body }) : { show: () => {} };
        // Share strings come from the Bible-studies namespace: the Encounters namespace has none, and the
        // reader already reuses another namespace's string the same way (`devotionals.errorRetry`).
        const discoveryT = (key) => i18n.t(`discovery.${key}`, '');
        // A page cached before verse-share.js was added has no VerseShare: the share button then does nothing.
        const verseShare = global.VerseShare ? global.VerseShare.createVerseShare({
            shareOrCopy: global.ShareOrCopy.shareOrCopy,
            navigator: global.navigator,
            playStoreUrl: global.DevotionalShare.PLAY_STORE_URL,
            toast,
            messages: { copied: discoveryT('copied'), shareError: discoveryT('shareError') },
        }) : null;
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
        // The PayPal button lives in the unlock sheet. Its script loads only when the support button is tapped (F2).
        const paypal = global.EncounterPaypal ? global.EncounterPaypal.createEncounterPaypal({
            h,
            config: global.DevotionalPwaConfig && global.DevotionalPwaConfig.encountersUnlock,
            checkout: global.PayPalCheckout,
            loadScript: loadScript,
            getSdk: () => global.paypal,
            note: t('unlock_offer_this_browser'),
        }) : { mount: () => false, isEnabled: () => false, supportLabel: () => '' };
        const unlockSheet = global.EncounterUnlockSheetDom.createUnlockSheet({
            h,
            t,
            container: doc.body,
            playStoreUrl: global.DevotionalShare.PLAY_STORE_URL,
            // With PayPal on, the support button replaces the Play link. No Android app to open on iOS.
            showPlayLink: !global.DevotionalIosHint.isIos(global.navigator) && !paypal.isEnabled(),
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
        // The thank-you pass after a payment. A page cached before pass-dom existed falls back to the toast.
        const pass = global.EncounterPassDom ? global.EncounterPassDom.createPassDom({
            h,
            t,
            container: doc.body,
            setBackgroundInert,
            focusFallback: () => { const title = byId('encounters-title'); title.setAttribute('tabindex', '-1'); title.focus(); },
            setTimer: (fn, ms) => global.setTimeout(fn, ms),
            clearTimer: (id) => global.clearTimeout(id),
            autoCloseMs: PASS_AUTO_CLOSE_MS,
        }) : null;

        function loadScript(url) {
            return new Promise((resolve, reject) => {
                const script = doc.createElement('script');
                script.src = url;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('PayPal SDK failed to load'));
                doc.head.append(script);
            });
        }

        function onUnlockGranted() {
            if (entitlement) entitlement.grant();
            try {
                // Refresh first: the card that opened the sheet is re-rendered, so close() must not refocus a detached card.
                listPage.refresh();
                unlockSheet.close();
                if (pass) pass.open();
                else toast.show(t('unlock_offer_thanks'));
            } catch (error) {
                // The payment is captured and stored already: the payer must still get the thank-you.
                console.error('Encounters: the post-payment screen failed', error);
                toast.show(t('unlock_offer_thanks'));
            }
        }

        function openUnlockSheet() {
            unlockSheet.open({
                mountActions: (actions) => {
                    if (!paypal.isEnabled()) return;
                    // The checkout loads only when this button is tapped; then the PayPal buttons take its place.
                    const support = h('button', {
                        class: 'encounter-sheet-support',
                        text: paypal.supportLabel(t('unlock_offer_button'), lang()),
                        attrs: { type: 'button' },
                        on: {
                            click: () => {
                                support.remove();
                                // The support button left the focus order: move focus to the safe choice, so Escape still works.
                                actions.querySelector('.encounter-sheet-keep').focus();
                                paypal.mount(actions, {
                                    onGranted: onUnlockGranted,
                                    onFailed: () => toast.show(t('unlock_offer_failed'), { kind: 'error' }),
                                    onUnavailable: () => {
                                        // Bring the support button back so the payer can retry; then offer the Play link where it applies.
                                        actions.prepend(support);
                                        if (global.DevotionalIosHint.isIos(global.navigator)) return;
                                        actions.append(h('a', {
                                            class: 'encounter-sheet-play',
                                            text: t('unlock_offer_play'),
                                            attrs: { href: global.DevotionalShare.PLAY_STORE_URL, rel: 'noopener', target: '_blank' },
                                        }));
                                    },
                                });
                            },
                        },
                    });
                    actions.prepend(support); // left of "Keep reading in order"
                },
            });
        }

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
            toast,
            completedMessage: t('encounter_completed_success'),
            onExit: () => router.close(),
            copyright: (language, bibleVersion) => global.DiscoveryCopyright.createCopyright({
                versionInfo: global.DevotionalVersion.versionInfo,
            }).resolve(language, bibleVersion),
        });
        readerView = global.EncounterReaderView.createReaderView({
            dom: global.EncounterReaderDom.createReaderDom({
                h,
                t,
                imageUrlFor: images.imageUrl,
                navLabels: { previous: discoveryT('previous'), next: discoveryT('next'), exit: discoveryT('exit') },
                keyVerseCard: global.KeyVerseCard ? global.KeyVerseCard.createKeyVerseCard({ h, shareVerse: verseShare ? verseShare.share : null, shareLabel: discoveryT('share') }) : null,
            }),
            root: detailView,
            listView,
            detailView,
            actions: reader,
        });

        // The deep link decides what shows: the lock rule is applied on the card list, not here.
        const deepLink = global.EncounterRoute.createDeepLink({
            loadCards: async () => global.EncounterCards.buildCards(await data.loadIndex(lang()), {
                completed: store.loadCompleted(),
                allUnlocked: isUnlockedAll(),
            }),
            actions: {
                showList: () => { reader.reset(); readerView.showList(); },
                openReader: (entry) => { readerView.showReader(); reader.open(entry); },
                showLocked: () => { reader.reset(); readerView.showList(); openUnlockSheet(); },
                showNotFound: (id) => {
                    reader.reset();
                    readerView.showReader();
                    readerView.render({ notFound: true, summary: { id }, phase: 'intro', intro: null, pages: [], index: 0, footer: {} });
                },
            },
        });

        const listPage = global.EncounterListPage.createListPage({
            // The hero and chips containers are absent on a page cached before the shared header existed.
            view: { count: byId('encounters-count'), body: byId('encounters-body'), hero: byId('encounters-hero'), chips: byId('encounters-chips') },
            lang,
            data,
            store,
            cards: global.EncounterCards,
            listDom,
            unlockSheet: { open: openUnlockSheet },
            allUnlocked: isUnlockedAll,
            afterRender: renderIcons,
            unlockLabel: t('new_unlocked'),
            onOpen: (id) => router.open(id),
            // Hero and filter copy is the Bible-studies copy, shared as-is (the Encounters namespace has none).
            labels: {
                startHere: discoveryT('startHere'),
                read: discoveryT('read'),
                filterAll: discoveryT('filterAll'),
                filterPending: discoveryT('filterPending'),
                filterCompleted: discoveryT('filterCompleted'),
            },
            sessionStorage: global.sessionStorage,
        });

        router = global.DiscoveryRouter.createRouter({
            win: global,
            nav: global.DiscoveryNav,
            // Back to the list: redraw from storage so a just-completed encounter shows as done and the next one opens (B6).
            onList: () => { deepLink.cancel(); reader.reset(); readerView.showList(); listPage.refresh(); },
            onDetail: (id) => { deepLink.open(id); },
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

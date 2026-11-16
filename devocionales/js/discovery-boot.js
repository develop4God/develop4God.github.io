(function (global) {
    'use strict';

    // Composition root of the Bible-studies list page: the only place that touches the real
    // DOM, storage, network and i18n singletons and hands them to the (unit-tested) modules.
    // Verified end to end by e2e/discovery-studies.spec.js.
    const DATA_BASE_URL = 'https://raw.githubusercontent.com/develop4God/Devocionales-json/refs/heads/main/discovery';
    const CACHE_NAME = 'discovery-studies-v1';
    const STUDY_URL = '/devocionales/estudios/';

    function boot() {
        const doc = global.document;
        const i18n = global.DevotionalI18n;
        const supported = Object.keys(global.i18n.supportedLanguages);
        const lang = () => i18n.getLanguage(supported, 'en');
        // 'retry' reuses the reader's existing string instead of duplicating it under discovery.*
        const t = (key) => (key === 'retry' ? i18n.t('devotionals.errorRetry', '') : i18n.t(`discovery.${key}`, ''));

        const byId = (id) => doc.getElementById(id);
        const view = { count: byId('studies-count'), hero: byId('studies-hero'), chips: byId('studies-chips'), body: byId('studies-body') };

        function applyStaticText() {
            doc.title = `${t('title')} - Devocionales Cristianos`;
            byId('studies-title').textContent = t('title');
            byId('studies-back-label').textContent = i18n.t('devotionals.navDevotional', '');
        }

        const page = global.DiscoveryListPage.createListPage({
            view,
            h: global.DomBuilder.createBuilder(doc),
            t,
            lang,
            data: global.DiscoveryData.createDiscoveryData({
                fetchWithRetry: global.DevotionalFetch.fetchWithRetry,
                cache: global.DiscoveryCache.createCacheStore(global.caches, CACHE_NAME),
                baseUrl: DATA_BASE_URL,
            }),
            store: global.DiscoveryStore.createDiscoveryStore(global.localStorage),
            sessionStorage: global.sessionStorage,
            sortFilter: global.DiscoverySortFilter,
            cardDomFactory: global.DiscoveryCardDom.createCardDom,
            listDomFactory: global.DiscoveryListDom.createListDom,
            shareText: global.DiscoveryShareText,
            playStoreUrl: global.DevotionalShare.PLAY_STORE_URL,
            shareOrCopy: global.ShareOrCopy.shareOrCopy,
            navigator: global.navigator,
            toast: global.UiToast.createToast({ document: doc, container: doc.body }),
            afterRender: () => global.lucide.createIcons(),
            onOpen: (id) => { global.location.href = `${STUDY_URL}?id=${encodeURIComponent(id)}`; },
        });

        applyStaticText();
        i18n.onLanguageChanged(() => { applyStaticText(); page.reload(); });
        // Another tab changed favourites / seen / progress: redraw from storage. A language change elsewhere: reload.
        global.addEventListener('storage', (e) => {
            if (e.key === 'develop4God_language') global.location.reload();
            else if (e.key && e.key.startsWith('discovery_')) page.refresh();
        });
        // Coming back through the back/forward cache must show the latest progress.
        global.addEventListener('pageshow', (e) => { if (e.persisted) page.refresh(); });
        page.init();
        global.lucide.createIcons();
    }

    global.DevotionalI18n.whenReady(boot);
})(window);

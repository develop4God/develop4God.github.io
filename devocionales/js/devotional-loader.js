(function () {
    'use strict';

    const JSON_BRANCH = 'main';

    // Default Bible version per supported language. 'es' intentionally maps to
    // the legacy filename (Devocional_year_{y}.json, no lang/version suffix)
    // for backward compatibility with the original single-language file.
    const LANGUAGE_VERSIONS = {
        es: 'RVR1960',
        en: 'NIV',
        pt: 'ARC',
        fr: 'LSG1910',
        ja: '新改訳2003',
        zh: '和合本1919',
        hi: 'HIOV',
        de: 'LU17',
        ar: 'NAV',
        fil: 'MBB05',
    };
    const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_VERSIONS);

    const LOCALE_TAGS = {
        es: 'es-ES', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR',
        ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', de: 'de-DE', ar: 'ar-SA', fil: 'fil-PH',
    };

    function resolveLanguage() {
        return DevotionalI18n.getLanguage(SUPPORTED_LANGUAGES, 'en');
    }

    let LANGUAGE = resolveLanguage();
    let VERSION = DevotionalVersion.resolveVersion(LANGUAGE, LANGUAGE_VERSIONS[LANGUAGE]);

    // Hero image filenames — fetched from Devocionales-assets' CI-generated
    // manifest instead of hardcoded here, so the list never drifts from the
    // real, validated file set (see .claude/skills/web-coding-agent/SKILL.md
    // Step 0, item 6).
    let devotionalImagesIndexPromise = null;

    async function loadDevotionalImagesIndex() {
        if (!devotionalImagesIndexPromise) {
            // Cache only resolves to a value, never to a rejection — a
            // transient failure would otherwise poison this promise for the
            // rest of the page's life, with no way to recover without a
            // full reload.
            devotionalImagesIndexPromise = DevotionalFetch.fetchWithRetry(
                'https://raw.githubusercontent.com/develop4God/Devocionales-assets/main/images/devotionals/index.json'
            ).then((res) => (res.ok ? res.json() : null)).catch(() => {
                devotionalImagesIndexPromise = null;
                return null;
            });
        }
        return devotionalImagesIndexPromise;
    }

    function devotionalJsonUrl(fileYear) {
        const base = `https://raw.githubusercontent.com/develop4God/Devocionales-json/refs/heads/${JSON_BRANCH}/Devocional_year_${fileYear}`;
        // The legacy no-suffix filename only covers 'es' at its default
        // version (RVR1960) — any other version, including a non-default
        // 'es' pick, needs the lang+version-suffixed filename.
        if (LANGUAGE === 'es' && VERSION === LANGUAGE_VERSIONS.es) return `${base}.json`;
        // encodeURIComponent covers version codes with non-ASCII characters
        // (e.g. Japanese/Chinese) safely; it's a no-op for ASCII codes.
        return `${base}_${LANGUAGE}_${encodeURIComponent(VERSION)}.json`;
    }

    // Cache of loaded year-files, keyed by "lang:version:fileYear" since the
    // same fileYear number maps to a different file per language+version.
    const loadedFiles = new Map();

    async function loadYearFile(fileYear) {
        const cacheKey = `${LANGUAGE}:${VERSION}:${fileYear}`;
        if (loadedFiles.has(cacheKey)) return loadedFiles.get(cacheKey);
        const res = await DevotionalFetch.fetchWithRetry(devotionalJsonUrl(fileYear));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const dates = json?.data?.[LANGUAGE] || {};
        const entry = { dates, sortedKeys: Object.keys(dates).sort() };
        loadedFiles.set(cacheKey, entry);
        return entry;
    }

    function recordForDate(fileData, dateKey) {
        const entry = fileData.dates[dateKey];
        return Array.isArray(entry) ? entry[0] : entry;
    }

    // index.json (published alongside the year-files) lists exactly which
    // years exist per language/version — cheaper and more reliable than
    // guessing by fetching year-files until one 404s.
    let repoIndexPromise = null;

    async function loadRepoIndex() {
        if (!repoIndexPromise) {
            // See loadDevotionalImagesIndex above — cache only a resolved
            // value, never a rejection, so a transient failure can be
            // retried instead of sticking for the page's lifetime.
            repoIndexPromise = DevotionalFetch.fetchWithRetry(
                `https://raw.githubusercontent.com/develop4God/Devocionales-json/refs/heads/${JSON_BRANCH}/index.json`
            ).then((res) => (res.ok ? res.json() : null)).catch(() => {
                repoIndexPromise = null;
                return null;
            });
        }
        return repoIndexPromise;
    }

    async function availableFileYears() {
        const index = await loadRepoIndex();
        const years = index?.files?.[LANGUAGE]?.[VERSION]?.files;
        if (years) return Object.keys(years).map(Number).sort((a, b) => a - b);
        return null;
    }

    // Which version codes index.json actually publishes for a language,
    // in stable order (defaults to LANGUAGE_VERSIONS' own order first).
    async function availableVersions(lang) {
        const index = await loadRepoIndex();
        const versions = index?.files?.[lang];
        if (!versions) return [LANGUAGE_VERSIONS[lang]];
        const codes = Object.keys(versions);
        return codes.includes(LANGUAGE_VERSIONS[lang])
            ? [LANGUAGE_VERSIONS[lang], ...codes.filter((c) => c !== LANGUAGE_VERSIONS[lang])]
            : codes;
    }

    // Walks backwards from the current year-file to find the oldest year-file
    // that actually exists, then returns its first date. Falls back to
    // brute-force fetching if index.json is unavailable.
    async function findEarliestDate() {
        const knownYears = await availableFileYears();
        if (knownYears?.length) {
            const fileData = await loadYearFile(knownYears[0]);
            return fileData.sortedKeys[0] || null;
        }

        let fileYear = DevotionalProgress.devotionalFileYear(new Date());
        let earliest = null;
        // eslint-disable-next-line no-constant-condition -- bounded by break on fetch failure
        while (true) {
            try {
                const fileData = await loadYearFile(fileYear);
                if (!fileData.sortedKeys.length) break;
                earliest = fileData.sortedKeys[0];
                fileYear -= 1;
            } catch {
                break;
            }
        }
        return earliest;
    }

    // Walks forward from the current file-year to find the newest date
    // content actually exists for. Falls back to brute-force fetching if
    // index.json is unavailable.
    async function findLatestDate() {
        const knownYears = await availableFileYears();
        if (knownYears?.length) {
            const fileData = await loadYearFile(knownYears[knownYears.length - 1]);
            return fileData.sortedKeys[fileData.sortedKeys.length - 1] || null;
        }

        let fileYear = DevotionalProgress.devotionalFileYear(new Date());
        let latest = null;
        // eslint-disable-next-line no-constant-condition -- bounded by break on fetch failure
        while (true) {
            try {
                const fileData = await loadYearFile(fileYear);
                if (fileData.sortedKeys.length) latest = fileData.sortedKeys[fileData.sortedKeys.length - 1];
                fileYear += 1;
            } catch {
                break;
            }
        }
        return latest;
    }

    // Injected into DevotionalNav's dependency-free functions — see
    // devotional-nav.js.
    const navDeps = { devotionalFileYear: DevotionalProgress.devotionalFileYear, loadYearFile, availableFileYears };

    async function heroImageForDate(dateKey) {
        const index = await loadDevotionalImagesIndex();
        const files = index?.files;
        if (!files?.length) return '';

        let hash = 0;
        for (let i = 0; i < dateKey.length; i++) {
            hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
        }
        const file = files[hash % files.length];
        return `https://raw.githubusercontent.com/develop4God/Devocionales-assets/main/images/devotionals/${file}`;
    }

    // Only wire click handlers once; render() is called on every navigation.
    let navHandlersBound = false;

    async function render(entry, dateKey) {
        const { ref, texto } = DevotionalRenderDom.splitVersiculo(entry.versiculo || '');

        DevotionalRenderDom.applyStaticUiText();

        document.getElementById('hero-image').src = await heroImageForDate(dateKey);
        document.getElementById('hero-image').alt = ref;

        document.getElementById('devotional-verse-ref').textContent = ref;
        // The label shows a visual day counter: today, shifted by however many
        // prev/next taps the visitor has made this session — independent of
        // which archive entry's content is actually displayed (dateKey).
        const displayDateKey = DevotionalProgress.addDays(DevotionalProgress.todayKey(), displayDateOffset);
        document.getElementById('devotional-date').textContent =
            new Date(displayDateKey + 'T00:00:00').toLocaleDateString(LOCALE_TAGS[LANGUAGE], { year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('devotional-date').setAttribute('datetime', dateKey);

        document.getElementById('devotional-reflexion').textContent = entry.reflexion || '';
        document.getElementById('devotional-oracion').textContent = entry.oracion || '';
        document.getElementById('devotional-verse-quote').textContent = texto ? `"${texto}"` : '';

        DevotionalRenderDom.renderAccordion(entry.para_meditar);
        DevotionalRenderDom.renderTags(entry.tags);
        DevotionalRenderDom.renderShareLinks(entry);
        DevotionalVersion.renderVersionCopyright(LANGUAGE, entry);
        DevotionalRenderDom.setupFontSizeToggle();
        DevotionalVersion.setupVersionSelect({
            getLanguage: () => LANGUAGE,
            getVersion: () => VERSION,
            setVersion: (v) => { VERSION = v; },
            availableVersions,
            onVersionChange: () => {
                document.getElementById('loading-state').classList.remove('hidden');
                document.getElementById('devotional-content').classList.add('hidden');
                loadDate(currentDateKey || DevotionalProgress.todayKey(), { pushHistory: false });
            },
        });
        DevotionalTts.setupTts(entry, LANGUAGE, LOCALE_TAGS[LANGUAGE]);

        if (!navHandlersBound) {
            document.getElementById('nav-prev').addEventListener('click', () => navigate(-1));
            document.getElementById('nav-next').addEventListener('click', () => navigate(1));
            navHandlersBound = true;
        }

        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('error-state').classList.add('hidden');
        document.getElementById('devotional-content').classList.remove('hidden');
        if (window.lucide) lucide.createIcons();

        await DevotionalNav.updateNavAvailability(dateKey, navDeps);
    }

    // Tracks whichever date is currently rendered, independent of the URL —
    // the URL only gains a ?date= param once the visitor explicitly navigates.
    let currentDateKey = null;

    // Purely a visual day counter for the displayed date label — starts at
    // today and moves +/-1 per prev/next tap, independent of which archive
    // entry's content actually loads (that's tracked by currentDateKey).
    let displayDateOffset = 0;

    async function loadDate(dateKey, { pushHistory } = { pushHistory: true }) {
        try {
            const fileYear = DevotionalProgress.devotionalFileYear(new Date(dateKey + 'T00:00:00'));
            const fileData = await loadYearFile(fileYear);
            const record = recordForDate(fileData, dateKey);
            if (!record) throw new Error(`No devotional found for ${dateKey}`);

            await render(record, dateKey);
            currentDateKey = dateKey;

            if (pushHistory) {
                const url = new URL(window.location.href);
                url.searchParams.set('date', dateKey);
                history.pushState({ dateKey }, '', url);
            }
        } catch (err) {
            console.error('Failed to load devotional:', err);
            DevotionalErrorLogger.logError('load_date', { message: err.message, date_key: dateKey });
            DevotionalRenderDom.showError(() => loadDate(dateKey, { pushHistory: false }));
        }
    }

    async function navigate(direction) {
        const current = currentDateKey || DevotionalProgress.todayKey();
        DevotionalNav.setNavDisabled(true, true);
        const target = await DevotionalNav.findAdjacentDate(current, direction, navDeps);
        if (target) {
            displayDateOffset += direction;
            await loadDate(target);
            if (direction > 0) DevotionalSalvationModal.showSalvationPrayerModal();
        } else {
            await DevotionalNav.updateNavAvailability(current, navDeps);
        }
    }

    async function init() {
        // Kick off in parallel with the rest of init — first real await is
        // inside heroImageForDate(), during render().
        loadDevotionalImagesIndex();

        // Wait for the shared i18n instance to finish its async init() (which
        // resolves ?lang=/localStorage/browser-language into currentLang)
        // before resolving LANGUAGE — otherwise LANGUAGE would be stuck at
        // the pre-init default from module-load time.
        await new Promise((resolve) => DevotionalI18n.whenReady(resolve));
        LANGUAGE = resolveLanguage();
        VERSION = DevotionalVersion.resolveVersion(LANGUAGE, LANGUAGE_VERSIONS[LANGUAGE]);

        const requestedDate = new URL(window.location.href).searchParams.get('date');
        try {
            const dateKey = requestedDate || await DevotionalProgress.resolveDefaultDate({ findEarliestDate, findLatestDate });
            await loadDate(dateKey, { pushHistory: false });
        } catch (err) {
            // resolveDefaultDate() (via findEarliestDate/findLatestDate) can
            // throw straight out of an unguarded loadYearFile() call when
            // index.json's known years are exhausted by fetch failures —
            // without this, that leaves the visitor stuck on the loading
            // skeleton forever, with no error UI and no retry path at all.
            console.error('Failed to initialize devotional reader:', err);
            DevotionalErrorLogger.logError('init', { message: err.message });
            DevotionalRenderDom.showError(() => init());
        }

        window.addEventListener('popstate', (ev) => {
            const dk = ev.state?.dateKey || DevotionalProgress.todayKey();
            loadDate(dk, { pushHistory: false });
        });

        // Re-render the same date in the new language when the shared
        // language-selector (i18n.js) reports a change. Progress/position in
        // the archive is unaffected — only the content language changes.
        window.addEventListener('languageChanged', (ev) => {
            const next = SUPPORTED_LANGUAGES.includes(ev.detail?.language) ? ev.detail.language : 'en';
            if (next === LANGUAGE) return;
            LANGUAGE = next;
            VERSION = DevotionalVersion.resolveVersion(LANGUAGE, LANGUAGE_VERSIONS[LANGUAGE]);
            document.getElementById('loading-state').classList.remove('hidden');
            document.getElementById('devotional-content').classList.add('hidden');
            loadDate(currentDateKey || DevotionalProgress.todayKey(), { pushHistory: false });
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();

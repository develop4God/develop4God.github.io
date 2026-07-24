(function () {
    'use strict';

    const JSON_BRANCH = 'main';
    const PROGRESS_KEY = 'devotionalProgress';

    // Default Bible version per supported language. 'es' intentionally maps to
    // the legacy filename (Devocional_year_{y}.json, no lang/version suffix)
    // for backward compatibility with the original single-language file.
    const LANGUAGE_VERSIONS = {
        es: 'RVR1960',
        en: 'NIV',
        pt: 'ARC',
        fr: 'LSG1910',
    };
    const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_VERSIONS);

    function resolveLanguage() {
        return DevotionalI18n.getLanguage(SUPPORTED_LANGUAGES, 'es');
    }

    let LANGUAGE = resolveLanguage();

    const HABITUS_IMAGES = [
        'blue_mountains.avif', 'bridge_waterfall.avif', 'circle_grass_green.avif',
        'desert_person.avif', 'desert_rocks.avif', 'desert_view_rocks.avif',
        'grass_tree.avif', 'gray_dock_lake.avif', 'lake.avif', 'lake_colors.avif',
        'lake_dock.avif', 'lake_flowers.avif', 'long_road.avif', 'mountain_pink.avif',
        'mountain_river.avif', 'river_rocks_trees.avif', 'road_green_montains.avif',
        'rocks_beach.avif', 'rocks_water.avif', 'snow_house.avif', 'snow_mountains.avif',
        'sunset_beach.avif', 'sunset_snow.avif'
    ];

    function todayKey() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Devocionales-json splits content into "year files" that run Aug-Jul.
    // For a given calendar date, the covering file is named after the year
    // its August start falls in.
    function devotionalFileYear(date) {
        return date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
    }

    function devotionalJsonUrl(fileYear) {
        const base = `https://raw.githubusercontent.com/develop4God/Devocionales-json/refs/heads/${JSON_BRANCH}/Devocional_year_${fileYear}`;
        if (LANGUAGE === 'es') return `${base}.json`;
        return `${base}_${LANGUAGE}_${LANGUAGE_VERSIONS[LANGUAGE]}.json`;
    }

    // Cache of loaded year-files, keyed by "lang:fileYear" since the same
    // fileYear number maps to a different file per language.
    const loadedFiles = new Map();

    async function loadYearFile(fileYear) {
        const cacheKey = `${LANGUAGE}:${fileYear}`;
        if (loadedFiles.has(cacheKey)) return loadedFiles.get(cacheKey);
        const res = await fetch(devotionalJsonUrl(fileYear));
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
            repoIndexPromise = fetch(
                `https://raw.githubusercontent.com/develop4God/Devocionales-json/refs/heads/${JSON_BRANCH}/index.json`
            ).then((res) => (res.ok ? res.json() : null)).catch(() => null);
        }
        return repoIndexPromise;
    }

    async function availableFileYears() {
        const index = await loadRepoIndex();
        const version = LANGUAGE_VERSIONS[LANGUAGE];
        const years = index?.files?.[LANGUAGE]?.[version]?.files;
        if (years) return Object.keys(years).map(Number).sort((a, b) => a - b);
        return null;
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

        let fileYear = devotionalFileYear(new Date());
        let earliest = null;
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

        let fileYear = devotionalFileYear(new Date());
        let latest = null;
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

    function daysBetween(a, b) {
        const msPerDay = 24 * 60 * 60 * 1000;
        return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / msPerDay);
    }

    function addDays(dateKey, days) {
        const d = new Date(dateKey + 'T00:00:00');
        d.setDate(d.getDate() + days);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function loadProgress() {
        try {
            return JSON.parse(localStorage.getItem(PROGRESS_KEY));
        } catch {
            return null;
        }
    }

    function saveProgress(startDate, firstVisitDate) {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify({ startDate, firstVisitDate }));
    }

    // A visitor's "today" is their own day-1 (earliest available devotional at
    // first visit) advanced by however many real calendar days have passed
    // since then — so nobody's progress starts stuck at the literal end of
    // the archive, but content still advances daily like a normal devotional.
    async function resolveDefaultDate() {
        const progress = loadProgress();
        const calendarToday = todayKey();
        let target;

        if (progress) {
            const elapsed = daysBetween(progress.firstVisitDate, calendarToday);
            target = addDays(progress.startDate, Math.max(0, elapsed));
        } else {
            const earliest = await findEarliestDate();
            const startDate = earliest || calendarToday;
            saveProgress(startDate, calendarToday);
            target = startDate;
        }

        // Cap at the newest content actually available, in case a visitor's
        // progress has run ahead of what's been published.
        const latest = await findLatestDate();
        if (latest && target > latest) target = latest;
        return target;
    }

    async function findAdjacentDate(dateKey, direction) {
        const fileYear = devotionalFileYear(new Date(dateKey + 'T00:00:00'));
        const fileData = await loadYearFile(fileYear);
        const idx = fileData.sortedKeys.indexOf(dateKey);

        if (idx === -1) return null;

        const nextIdx = idx + direction;
        if (nextIdx >= 0 && nextIdx < fileData.sortedKeys.length) {
            return fileData.sortedKeys[nextIdx];
        }

        // Crossed a file boundary — try the adjacent year-file.
        const adjacentFileYear = fileYear + direction;
        try {
            const adjacentData = await loadYearFile(adjacentFileYear);
            if (!adjacentData.sortedKeys.length) return null;
            return direction > 0 ? adjacentData.sortedKeys[0] : adjacentData.sortedKeys[adjacentData.sortedKeys.length - 1];
        } catch {
            return null;
        }
    }

    function heroImageForDate(dateKey) {
        let hash = 0;
        for (let i = 0; i < dateKey.length; i++) {
            hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
        }
        const file = HABITUS_IMAGES[hash % HABITUS_IMAGES.length];
        return `https://raw.githubusercontent.com/develop4God/Devocionales-assets/main/images/habitus/${file}`;
    }

    function showError() {
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('error-state').classList.remove('hidden');
        document.getElementById('error-state').querySelector('p').textContent =
            DevotionalI18n.t('devotionals.errorLoad', '');
    }

    function splitVersiculo(raw) {
        // "Libro C:V VERSION: "texto"" -> { ref: "Libro C:V VERSION", texto: "texto" }
        const quoteIdx = raw.indexOf('"');
        if (quoteIdx === -1) return { ref: raw, texto: '' };
        const ref = raw.slice(0, raw.lastIndexOf(':', quoteIdx)).trim();
        const texto = raw.slice(quoteIdx).replace(/^"|"$/g, '');
        return { ref: ref || raw, texto };
    }

    function renderAccordion(paraMeditar) {
        const container = document.getElementById('meditar-accordion');
        container.innerHTML = '';
        (paraMeditar || []).forEach((item, i) => {
            const wrap = document.createElement('div');
            wrap.className = 'accordion-item';
            wrap.innerHTML = `
                <button class="accordion-title" type="button" aria-expanded="false">
                    <span>${item.cita}</span>
                    <i data-lucide="chevron-down" class="chev w-4 h-4"></i>
                </button>
                <div class="accordion-content">
                    <div class="accordion-content-inner">${item.texto}</div>
                </div>
            `;
            const title = wrap.querySelector('.accordion-title');
            title.addEventListener('click', () => {
                const isOpen = wrap.classList.toggle('open');
                title.setAttribute('aria-expanded', String(isOpen));
            });
            container.appendChild(wrap);
        });
    }

    function renderTags(tags) {
        const wrap = document.getElementById('tags-wrap');
        const list = document.getElementById('tags-list');
        if (!tags || !tags.length) {
            wrap.classList.add('hidden');
            return;
        }
        list.innerHTML = tags.map(t => `<span class="tag-pill">${t}</span>`).join('');
    }

    function renderShareLinks(entry) {
        const url = window.location.href;
        const eyebrow = DevotionalI18n.t('devotionals.eyebrow', '');
        const text = encodeURIComponent(`${eyebrow}: ${entry.versiculo}`);
        document.getElementById('share-fb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        document.getElementById('share-x').href = `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`;
        document.getElementById('share-mail').href = `mailto:?subject=${encodeURIComponent(eyebrow)}&body=${text}%20${encodeURIComponent(url)}`;
    }

    function setupFontSizeToggle() {
        const scope = document.getElementById('font-scope');
        document.querySelectorAll('input[name="fontsize"]').forEach(input => {
            input.addEventListener('change', () => {
                scope.classList.remove('size-large', 'size-larger');
                if (input.value) scope.classList.add(input.value);
            });
        });
    }

    // Builds TTS-ready text from a devotional entry: expands book ordinals,
    // Bible version codes, and "chapter:verse" into spoken-out-loud phrasing
    // (also prevents e.g. "3:16" from being misread as a clock time). Ported
    // from the Flutter app's DevocionalTtsTextBuilder/BibleTextFormatter —
    // see bible-text-formatter.js.
    function buildTtsText(entry) {
        const eyebrow = DevotionalI18n.t('devotionals.eyebrow', '');
        const reflexion = DevotionalI18n.t('devotionals.reflexion', '');
        const paraMeditar = DevotionalI18n.t('devotionals.paraMeditar', '');
        const oracion = DevotionalI18n.t('devotionals.oracion', '');
        const norm = (s) => BibleTextFormatter.normalizeTtsText(s || '', LANGUAGE, entry.version);
        const parts = [
            `${eyebrow}: ${norm(entry.versiculo)}`,
            `${reflexion}: ${norm(entry.reflexion)}`,
        ];
        if (entry.para_meditar && entry.para_meditar.length) {
            const meditar = entry.para_meditar
                .map((m) => `${norm(m.cita)}: ${m.texto}`)
                .join('\n');
            parts.push(`${paraMeditar}: ${meditar}`);
        }
        parts.push(`${oracion}: ${norm(entry.oracion)}`);
        return parts.join('\n');
    }

    // The entry currently loaded for TTS purposes. setupTts() only ever
    // attaches ONE click listener (guarded below) and reads this on each
    // click, instead of re-attaching a new listener — with a stale closure
    // over the old entry — on every render(). Stacked listeners were
    // triggering speechSynthesis.speak() multiple times per click after
    // navigating a few times, which also broke "stop" (cancel() only
    // silenced one of several overlapping utterances).
    let ttsEntry = null;
    let ttsHandlerBound = false;

    function setupTts(entry) {
        ttsEntry = entry;
        const btn = document.getElementById('tts-btn');

        if (!('speechSynthesis' in window)) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            return;
        }

        // Switching devotionals (nav or language change) while speech is
        // active would otherwise keep reading the old entry's text.
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
            btn.classList.remove('speaking');
            btn.querySelector('.tts-label').textContent = DevotionalI18n.t('devotionals.listen', '');
        }

        if (ttsHandlerBound) return;
        ttsHandlerBound = true;

        btn.addEventListener('click', () => {
            const label = btn.querySelector('.tts-label');
            const listen = DevotionalI18n.t('devotionals.listen', '');
            if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
                btn.classList.remove('speaking');
                label.textContent = listen;
                return;
            }

            const utterance = new SpeechSynthesisUtterance(buildTtsText(ttsEntry));
            utterance.lang = DevotionalI18n.t('devotionals.ttsLang', LOCALE_TAGS[LANGUAGE] || '');
            utterance.onend = () => {
                btn.classList.remove('speaking');
                label.textContent = listen;
            };
            speechSynthesis.speak(utterance);
            btn.classList.add('speaking');
            label.textContent = DevotionalI18n.t('devotionals.stop', '');
        });
    }

    // Only wire click handlers once; render() is called on every navigation.
    let navHandlersBound = false;

    const LOCALE_TAGS = { es: 'es-ES', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR' };

    function applyStaticUiText() {
        document.getElementById('back-link').textContent = DevotionalI18n.t('devotionals.backLink', '');
        document.getElementById('eyebrow-label').textContent = DevotionalI18n.t('devotionals.eyebrow', '');
        document.getElementById('download-app-label').textContent = DevotionalI18n.t('devotionals.downloadApp', '');
        document.getElementById('reading-options-label').textContent = DevotionalI18n.t('devotionals.readingOptions', '');
        document.getElementById('para-meditar-label').textContent = DevotionalI18n.t('devotionals.paraMeditar', '');
        document.getElementById('temas-label').textContent = DevotionalI18n.t('devotionals.temas', '');
        document.getElementById('versiculo-label').textContent = DevotionalI18n.t('devotionals.versiculo', '');
        document.getElementById('reflexion-label').textContent = DevotionalI18n.t('devotionals.reflexion', '');
        document.getElementById('oracion-label').textContent = DevotionalI18n.t('devotionals.oracion', '');
        document.getElementById('comparte-label').textContent = DevotionalI18n.t('devotionals.comparte', '');
        document.querySelector('.tts-label').textContent = DevotionalI18n.t('devotionals.listen', '');
    }

    function render(entry, dateKey) {
        const { ref, texto } = splitVersiculo(entry.versiculo || '');

        applyStaticUiText();

        document.getElementById('hero-image').src = heroImageForDate(dateKey);
        document.getElementById('hero-image').alt = ref;
        document.getElementById('hero-credit').textContent = DevotionalI18n.t('devotionals.heroCredit', '');

        document.getElementById('devotional-verse-ref').textContent = ref;
        // The label always shows the visitor's real calendar date — it reads as
        // "today's devotional" regardless of which archive entry is displayed.
        document.getElementById('devotional-date').textContent =
            new Date(todayKey() + 'T00:00:00').toLocaleDateString(LOCALE_TAGS[LANGUAGE], { year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('devotional-date').setAttribute('datetime', dateKey);

        document.getElementById('devotional-reflexion').textContent = entry.reflexion || '';
        document.getElementById('devotional-oracion').textContent = entry.oracion || '';
        document.getElementById('devotional-verse-quote').textContent = texto ? `"${texto}"` : '';

        renderAccordion(entry.para_meditar);
        renderTags(entry.tags);
        renderShareLinks(entry);
        setupFontSizeToggle();
        setupTts(entry);

        if (!navHandlersBound) {
            document.getElementById('nav-prev').addEventListener('click', () => navigate(-1));
            document.getElementById('nav-next').addEventListener('click', () => navigate(1));
            navHandlersBound = true;
        }

        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('error-state').classList.add('hidden');
        document.getElementById('devotional-content').classList.remove('hidden');
        if (window.lucide) lucide.createIcons();

        setNavDisabled(false, false);
    }

    function setNavDisabled(prevDisabled, nextDisabled) {
        document.getElementById('nav-prev').disabled = prevDisabled;
        document.getElementById('nav-next').disabled = nextDisabled;
    }

    // Tracks whichever date is currently rendered, independent of the URL —
    // the URL only gains a ?date= param once the visitor explicitly navigates.
    let currentDateKey = null;

    async function loadDate(dateKey, { pushHistory } = { pushHistory: true }) {
        try {
            const fileYear = devotionalFileYear(new Date(dateKey + 'T00:00:00'));
            const fileData = await loadYearFile(fileYear);
            const record = recordForDate(fileData, dateKey);
            if (!record) throw new Error(`No devotional found for ${dateKey}`);

            render(record, dateKey);
            currentDateKey = dateKey;

            if (pushHistory) {
                const url = new URL(window.location.href);
                url.searchParams.set('date', dateKey);
                history.pushState({ dateKey }, '', url);
            }
        } catch (err) {
            console.error('Failed to load devotional:', err);
            showError();
        }
    }

    async function navigate(direction) {
        const current = currentDateKey || todayKey();
        setNavDisabled(true, true);
        const target = await findAdjacentDate(current, direction);
        if (target) await loadDate(target);
        else setNavDisabled(false, false);
    }

    async function init() {
        // Wait for the shared i18n instance to finish its async init() (which
        // resolves ?lang=/localStorage/browser-language into currentLang)
        // before resolving LANGUAGE — otherwise LANGUAGE would be stuck at
        // the pre-init default from module-load time.
        await new Promise((resolve) => DevotionalI18n.whenReady(resolve));
        LANGUAGE = resolveLanguage();

        const requestedDate = new URL(window.location.href).searchParams.get('date');
        const dateKey = requestedDate || await resolveDefaultDate();
        await loadDate(dateKey, { pushHistory: false });

        window.addEventListener('popstate', (ev) => {
            const dk = ev.state?.dateKey || todayKey();
            loadDate(dk, { pushHistory: false });
        });

        // Re-render the same date in the new language when the shared
        // language-selector (i18n.js) reports a change. Progress/position in
        // the archive is unaffected — only the content language changes.
        window.addEventListener('languageChanged', (ev) => {
            const next = SUPPORTED_LANGUAGES.includes(ev.detail?.language) ? ev.detail.language : 'es';
            if (next === LANGUAGE) return;
            LANGUAGE = next;
            document.getElementById('loading-state').classList.remove('hidden');
            document.getElementById('devotional-content').classList.add('hidden');
            loadDate(currentDateKey || todayKey(), { pushHistory: false });
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();

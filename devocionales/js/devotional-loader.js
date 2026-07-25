(function () {
    'use strict';

    const JSON_BRANCH = 'main';
    const PROGRESS_KEY = 'devotionalProgress';
    const SALVATION_DONT_SHOW_KEY = 'salvationPrayerDontShow';

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
    const VERSION_KEY_PREFIX = 'devocionalVersion:';

    // Full display name + legal copyright/attribution text per (language,
    // version) — ported from devocional_nuevo (Flutter app)'s
    // lib/utils/copyright_utils.dart (copyright text) and
    // bible_reader_core/lib/src/bible_version_registry.dart (display names),
    // consolidated into one table and scoped to the 20 codes this repo
    // actually serves (confirmed against Devocionales-json's index.json).
    // Keep in sync with the Dart source if either changes.
    const BIBLE_VERSION_INFO = {
        es: {
            RVR1960: { name: 'Reina Valera 1960', copyright: 'El texto bíblico Reina-Valera 1960® Sociedades Bíblicas en América Latina, 1960. Derechos renovados 1988, Sociedades Bíblicas Unidas.' },
            NVI: { name: 'Nueva Versión Internacional', copyright: 'El texto bíblico Nueva Versión Internacional® © 1999 Biblica, Inc. Todos los derechos reservados.' },
        },
        en: {
            KJV: { name: 'King James Version', copyright: 'The biblical text King James Version® Public Domain.' },
            NIV: { name: 'New International Version', copyright: 'The biblical text New International Version® © 2011 Biblica, Inc. All rights reserved.' },
        },
        pt: {
            ARC: { name: 'Almeida Revista e Corrigida', copyright: 'O texto bíblico Almeida Revista e Corrigida® Domínio Público.' },
            NVI: { name: 'Nova Versão Internacional', copyright: 'O texto bíblico Nova Versão Internacional® © 2000 Biblica, Inc. Todos os direitos reservados.' },
        },
        fr: {
            LSG1910: { name: 'Louis Segond 1910', copyright: 'Le texte biblique Louis Segond 1910® Domaine Public.' },
            TOB: { name: 'Traduction Oecuménique de la Bible', copyright: 'Le texte biblique Traduction Oecuménique de la Bible® © Société Biblique Française et Éditions du Cerf.' },
        },
        ja: {
            '新改訳2003': { name: '新改訳2003', copyright: '聖書本文 新改訳2003聖書® © 2003 新日本聖書刊行会。すべての権利が保護されています。' },
            'リビングバイブル': { name: 'リビングバイブル', copyright: '聖書本文 リビングバイブル® © 1997 新日本聖書刊行会。すべての権利が保護されています。' },
        },
        zh: {
            '和合本1919': { name: '和合本1919', copyright: '圣经和合本版权属于公有领域。' },
            '新译本': { name: '新译本', copyright: '圣经《新译本》版权属于环球圣经公会，蒙允准使用。版权所有，不得翻印。' },
        },
        hi: {
            HIOV: { name: 'पवित्र बाइबिल (ओ.वी.)', copyright: 'पवित्र बाइबिल हिन्दी ओ.वी. संस्करण (HIOV) © Bible Society of India. सभी अधिकार सुरक्षित।' },
            HERV: { name: 'पवित्र बाइबिल (HERV)', copyright: 'पवित्र बाइबिल आसान हिंदी संस्करण (HERV) © 1995, 2010 Bible League International. सभी अधिकार सुरक्षित।' },
        },
        de: {
            LU17: { name: 'Lutherbibel 2017', copyright: 'Lutherbibel, revidiert 2017, © 2016 Deutsche Bibelgesellschaft, Stuttgart.' },
            SCH2000: { name: 'Schlachter 2000', copyright: 'Schlachter 2000 © Genfer Bibelgesellschaft. Alle Rechte vorbehalten.' },
        },
        ar: {
            NAV: { name: 'كتاب الحياة', copyright: 'النص الكتابي الترجمة العربية الجديدة © 2005 Biblica, Inc. جميع الحقوق محفوظة.' },
            SVDA: { name: 'فان دايك', copyright: 'النص الكتابي ترجمة سميث وفاندايك، ملك عام.' },
        },
        fil: {
            MBB05: { name: 'Magandang Balita Biblia', copyright: 'Ang Magandang Balita Biblia (MBB) © 2005, 2012 Philippine Bible Society. Lahat ng karapatan ay nakalaan.' },
            ASND: { name: 'Ang Salita ng Dios', copyright: 'Ang Salita ng Dios (Tagalog Contemporary Bible) © 2009, 2011, 2014, 2015 Biblica, Inc. ® Ginamit sa pahintulot ng Biblica, Inc.® Lahat ng karapatan ay nakalaan sa buong mundo.' },
        },
    };

    function versionInfo(lang, version) {
        return (BIBLE_VERSION_INFO[lang] && BIBLE_VERSION_INFO[lang][version]) || null;
    }

    function resolveLanguage() {
        return DevotionalI18n.getLanguage(SUPPORTED_LANGUAGES, 'en');
    }

    let LANGUAGE = resolveLanguage();

    // Selected Bible version per language, persisted independently per
    // language (a version choice in one language has no meaning in another).
    // Falls back to LANGUAGE_VERSIONS' default until the visitor picks one,
    // or if the stored code isn't (no longer) a valid option for that language.
    function resolveVersion(lang) {
        const stored = localStorage.getItem(VERSION_KEY_PREFIX + lang);
        return stored || LANGUAGE_VERSIONS[lang];
    }

    let VERSION = resolveVersion(LANGUAGE);

    function setVersion(lang, version) {
        localStorage.setItem(VERSION_KEY_PREFIX + lang, version);
    }

    // Hero image filenames — fetched from Devocionales-assets' CI-generated
    // manifest instead of hardcoded here, so the list never drifts from the
    // real, validated file set (see .claude/skills/web-coding-agent/SKILL.md
    // Step 0, item 6).
    let devotionalImagesIndexPromise = null;

    async function loadDevotionalImagesIndex() {
        if (!devotionalImagesIndexPromise) {
            devotionalImagesIndexPromise = fetch(
                'https://raw.githubusercontent.com/develop4God/Devocionales-assets/main/images/devotionals/index.json'
            ).then((res) => (res.ok ? res.json() : null)).catch(() => null);
        }
        return devotionalImagesIndexPromise;
    }

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

        let fileYear = devotionalFileYear(new Date());
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

        let fileYear = devotionalFileYear(new Date());
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
        (paraMeditar || []).forEach((item) => {
            const wrap = document.createElement('div');
            wrap.className = 'accordion-item open';
            wrap.innerHTML = `
                <button class="accordion-title" type="button" aria-expanded="true">
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

    // Legally-required per-version attribution/copyright notice, always
    // visible (not tap-to-expand) — matches the Flutter app's persistent
    // inline-text pattern (see devocional_nuevo's copyright_utils.dart).
    // Uses entry.version (the version actually loaded for this content),
    // not the module-level VERSION selector state, so it's never out of
    // sync with what's on screen.
    function renderVersionCopyright(entry) {
        const el = document.getElementById('version-copyright');
        const info = versionInfo(LANGUAGE, entry.version);
        if (!info) {
            el.textContent = '';
            return;
        }
        const label = DevotionalI18n.t('devotionals.versionCopyrightLabel', 'Bible version');
        el.textContent = `${label}: ${info.name} (${entry.version}) — ${info.copyright}`;
    }

    // Same stacked-listener pitfall as setupTts (see above): renderShareLinks
    // runs on every entry render (nav/language change), so the native-share
    // click handler is bound once and reads current share data from this
    // module-level variable instead of being re-attached per render.
    let shareData = null;
    let shareHandlerBound = false;

    function renderShareLinks(entry) {
        const url = window.location.href;
        const eyebrow = DevotionalI18n.t('devotionals.eyebrow', '');
        const labels = {
            eyebrow,
            versiculo: DevotionalI18n.t('devotionals.versiculo', ''),
            reflexion: DevotionalI18n.t('devotionals.reflexion', ''),
            oracion: DevotionalI18n.t('devotionals.oracion', ''),
            footerTitle: DevotionalI18n.t('devotionals.shareFooterTitle', ''),
            footerCompleteApp: DevotionalI18n.t('devotionals.shareFooterCompleteApp', ''),
            footerDailyDevotionals: DevotionalI18n.t('devotionals.shareFooterDailyDevotionals', ''),
            footerAudioReading: DevotionalI18n.t('devotionals.shareFooterAudioReading', ''),
            footerBibleStudies: DevotionalI18n.t('devotionals.shareFooterBibleStudies', ''),
            footerBibleVersions: DevotionalI18n.t('devotionals.shareFooterBibleVersions', ''),
            footerAndMore: DevotionalI18n.t('devotionals.shareFooterAndMore', ''),
            footerDownload: DevotionalI18n.t('devotionals.shareFooterDownload', ''),
            footerBenefits: DevotionalI18n.t('devotionals.shareFooterBenefits', ''),
            footerDeveloper: DevotionalI18n.t('devotionals.shareFooterDeveloper', ''),
        };
        const shareText = DevotionalShare.buildShareText(entry, labels);
        shareData = { title: eyebrow, text: shareText, url };

        const nativeBtn = document.getElementById('share-native');
        nativeBtn.setAttribute('aria-label', DevotionalI18n.t('devotionals.shareAria', ''));
        if (!navigator.share) {
            nativeBtn.classList.add('hidden');
            return;
        }

        if (shareHandlerBound) return;
        shareHandlerBound = true;
        nativeBtn.addEventListener('click', () => {
            navigator.share(shareData).catch(() => {});
        });
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

    const LOCALE_TAGS = {
        es: 'es-ES', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR',
        ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', de: 'de-DE', ar: 'ar-SA', fil: 'fil-PH',
    };

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
        document.getElementById('app-banner-message').textContent = DevotionalI18n.t('devotionals.appBannerText', '');
        document.getElementById('app-banner-cta').textContent = DevotionalI18n.t('devotionals.appBannerCta', '');
        document.getElementById('app-banner-close').setAttribute('aria-label', DevotionalI18n.t('devotionals.appBannerClose', ''));
        if (localStorage.getItem('appBannerDismissed') !== '1') {
            document.getElementById('app-banner').classList.remove('hidden');
        }
        document.getElementById('nav-vision-label').textContent = DevotionalI18n.t('devotionals.navVision', '');
        document.getElementById('nav-devotional-label').textContent = DevotionalI18n.t('devotionals.navDevotional', '');
        document.getElementById('footer-tagline').textContent = DevotionalI18n.t('devotionals.footerTagline', '');
        document.getElementById('footer-contact-label').textContent = DevotionalI18n.t('devotionals.contactMailAria', '');
        document.getElementById('version-select').setAttribute('aria-label', DevotionalI18n.t('devotionals.versionSelectAria', ''));
        document.getElementById('version-info-btn').setAttribute('aria-label', DevotionalI18n.t('devotionals.versionInfoAria', ''));
    }

    // Populates the version <select> with whatever index.json publishes for
    // the current LANGUAGE, and re-loads the current date under the newly
    // selected version on change. Rebuilt on every render() (language can
    // change the option list), but the change listener is bound once and
    // reads LANGUAGE/VERSION via closure — same stacked-listener avoidance
    // as setupTts/renderShareLinks above.
    let versionHandlerBound = false;

    async function setupVersionSelect() {
        const select = document.getElementById('version-select');
        const versions = await availableVersions(LANGUAGE);

        select.innerHTML = versions.map((v) => `<option value="${v}">${v}</option>`).join('');
        select.value = VERSION;
        updateVersionInfoPopover();

        if (versionHandlerBound) return;
        versionHandlerBound = true;
        select.addEventListener('change', () => {
            VERSION = select.value;
            setVersion(LANGUAGE, VERSION);
            updateVersionInfoPopover();
            document.getElementById('loading-state').classList.remove('hidden');
            document.getElementById('devotional-content').classList.add('hidden');
            loadDate(currentDateKey || todayKey(), { pushHistory: false });
        });
    }

    // (i) button next to the version dropdown: shows the selected version's
    // full display name (e.g. "NVI" -> "Nueva Versión Internacional") for
    // visitors who don't recognize the acronym. Separate from
    // renderVersionCopyright's persistent legal notice — this is a quick,
    // dismissible lookup, not the compliance-required text.
    let versionInfoHandlerBound = false;

    function updateVersionInfoPopover() {
        const info = versionInfo(LANGUAGE, VERSION);
        const popover = document.getElementById('version-info-popover');
        popover.textContent = info ? `${info.name} (${VERSION})` : VERSION;

        if (versionInfoHandlerBound) return;
        versionInfoHandlerBound = true;
        const btn = document.getElementById('version-info-btn');
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const isOpen = popover.classList.toggle('hidden') === false;
            btn.setAttribute('aria-expanded', String(isOpen));
        });
        document.addEventListener('click', (ev) => {
            if (!popover.classList.contains('hidden') && !popover.contains(ev.target) && ev.target !== btn) {
                popover.classList.add('hidden');
                btn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    async function render(entry, dateKey) {
        const { ref, texto } = splitVersiculo(entry.versiculo || '');

        applyStaticUiText();

        document.getElementById('hero-image').src = await heroImageForDate(dateKey);
        document.getElementById('hero-image').alt = ref;

        document.getElementById('devotional-verse-ref').textContent = ref;
        // The label shows a visual day counter: today, shifted by however many
        // prev/next taps the visitor has made this session — independent of
        // which archive entry's content is actually displayed (dateKey).
        const displayDateKey = addDays(todayKey(), displayDateOffset);
        document.getElementById('devotional-date').textContent =
            new Date(displayDateKey + 'T00:00:00').toLocaleDateString(LOCALE_TAGS[LANGUAGE], { year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('devotional-date').setAttribute('datetime', dateKey);

        document.getElementById('devotional-reflexion').textContent = entry.reflexion || '';
        document.getElementById('devotional-oracion').textContent = entry.oracion || '';
        document.getElementById('devotional-verse-quote').textContent = texto ? `"${texto}"` : '';

        renderAccordion(entry.para_meditar);
        renderTags(entry.tags);
        renderShareLinks(entry);
        renderVersionCopyright(entry);
        setupFontSizeToggle();
        setupVersionSelect();
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

    // Salvation prayer modal — shown after the visitor advances to a new
    // devotional (mirrors SalvationPrayerDialog in the Flutter app), unless
    // they've previously checked "don't show again".
    let salvationModalBound = false;

    function showSalvationPrayerModal() {
        if (localStorage.getItem(SALVATION_DONT_SHOW_KEY) === '1') return;

        const modal = document.getElementById('salvation-prayer-modal');
        document.getElementById('salvation-modal-title').textContent = DevotionalI18n.t('devotionals.salvationPrayerTitle', '');
        document.getElementById('salvation-modal-intro').textContent = DevotionalI18n.t('devotionals.salvationPrayerIntro', '');
        document.getElementById('salvation-modal-prayer').textContent = DevotionalI18n.t('devotionals.salvationPrayer', '');
        document.getElementById('salvation-modal-promise').textContent = DevotionalI18n.t('devotionals.salvationPromise', '');
        document.getElementById('salvation-modal-already-prayed').textContent = DevotionalI18n.t('devotionals.salvationAlreadyPrayed', '');
        document.getElementById('salvation-modal-continue').textContent = DevotionalI18n.t('devotionals.salvationContinue', '');
        document.getElementById('salvation-modal-dont-show').checked = false;
        modal.classList.remove('hidden');

        if (salvationModalBound) return;
        salvationModalBound = true;
        document.getElementById('salvation-modal-continue').addEventListener('click', () => {
            const dontShow = document.getElementById('salvation-modal-dont-show').checked;
            if (dontShow) localStorage.setItem(SALVATION_DONT_SHOW_KEY, '1');
            modal.classList.add('hidden');
        });
    }

    function setNavDisabled(prevDisabled, nextDisabled) {
        document.getElementById('nav-prev').disabled = prevDisabled;
        document.getElementById('nav-next').disabled = nextDisabled;
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
            const fileYear = devotionalFileYear(new Date(dateKey + 'T00:00:00'));
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
            showError();
        }
    }

    async function navigate(direction) {
        const current = currentDateKey || todayKey();
        setNavDisabled(true, true);
        const target = await findAdjacentDate(current, direction);
        if (target) {
            displayDateOffset += direction;
            await loadDate(target);
            if (direction > 0) showSalvationPrayerModal();
        } else {
            setNavDisabled(false, false);
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
        VERSION = resolveVersion(LANGUAGE);

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
            const next = SUPPORTED_LANGUAGES.includes(ev.detail?.language) ? ev.detail.language : 'en';
            if (next === LANGUAGE) return;
            LANGUAGE = next;
            VERSION = resolveVersion(LANGUAGE);
            document.getElementById('loading-state').classList.remove('hidden');
            document.getElementById('devotional-content').classList.add('hidden');
            loadDate(currentDateKey || todayKey(), { pushHistory: false });
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();

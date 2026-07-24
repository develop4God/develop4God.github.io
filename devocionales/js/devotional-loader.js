(function () {
    'use strict';

    const JSON_BRANCH = 'main';
    const LANGUAGE = 'es';
    const PROGRESS_KEY = 'devotionalProgress';

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
        return `https://raw.githubusercontent.com/develop4God/Devocionales-json/refs/heads/${JSON_BRANCH}/Devocional_year_${fileYear}.json`;
    }

    // Cache of loaded year-files: fileYear -> sorted array of date keys present in it.
    const loadedFiles = new Map();

    async function loadYearFile(fileYear) {
        if (loadedFiles.has(fileYear)) return loadedFiles.get(fileYear);
        const res = await fetch(devotionalJsonUrl(fileYear));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const dates = json?.data?.[LANGUAGE] || {};
        const entry = { dates, sortedKeys: Object.keys(dates).sort() };
        loadedFiles.set(fileYear, entry);
        return entry;
    }

    function recordForDate(fileData, dateKey) {
        const entry = fileData.dates[dateKey];
        return Array.isArray(entry) ? entry[0] : entry;
    }

    // Walks backwards from the current year-file to find the oldest year-file
    // that actually exists, then returns its first date. Nothing is hardcoded:
    // this just keeps trying earlier years until a fetch 404s.
    async function findEarliestDate() {
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

    // Walks forward from the current file-year, trying successive years until
    // one fails to load, to find the newest date content actually exists for.
    async function findLatestDate() {
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
        const text = encodeURIComponent(`Devocional de hoy: ${entry.versiculo}`);
        document.getElementById('share-fb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        document.getElementById('share-x').href = `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`;
        document.getElementById('share-mail').href = `mailto:?subject=${encodeURIComponent('Devocional de hoy')}&body=${text}%20${encodeURIComponent(url)}`;
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

    // Spanish TTS engines read "3:16" as a clock time ("las tres y dieciséis
    // de la mañana") because it matches an H:MM pattern. Bible references use
    // the same "chapter:verse" shape, so we rewrite them to unambiguous
    // spoken-out-loud text before handing anything to SpeechSynthesisUtterance.
    // Only affects what's spoken — the on-screen text is untouched.
    function normalizeForSpeech(text) {
        return text.replace(
            /\b(\d{1,3}):(\d{1,3}(?:-\d{1,3})?)\b/g,
            (match, chapter, verses) => {
                const verseText = verses.includes('-')
                    ? `versículos ${verses.replace('-', ' al ')}`
                    : `versículo ${verses}`;
                return `capítulo ${chapter}, ${verseText}`;
            }
        );
    }

    function setupTts(entry) {
        const btn = document.getElementById('tts-btn');
        const label = btn.querySelector('.tts-label');
        if (!('speechSynthesis' in window)) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            return;
        }

        let utterance = null;

        btn.addEventListener('click', () => {
            if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
                btn.classList.remove('speaking');
                label.textContent = 'Escuchar';
                return;
            }

            const text = normalizeForSpeech([entry.versiculo, entry.reflexion, entry.oracion].join('. '));
            utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-ES';
            utterance.onend = () => {
                btn.classList.remove('speaking');
                label.textContent = 'Escuchar';
            };
            speechSynthesis.speak(utterance);
            btn.classList.add('speaking');
            label.textContent = 'Escuchar';
        });
    }

    // Only wire click handlers once; render() is called on every navigation.
    let navHandlersBound = false;

    function render(entry, dateKey) {
        const { ref, texto } = splitVersiculo(entry.versiculo || '');

        // Clear any previously-inserted verse-quote node from a prior render.
        const existingQuote = document.getElementById('devotional-verse-quote');
        if (existingQuote) existingQuote.remove();

        document.getElementById('hero-image').src = heroImageForDate(dateKey);
        document.getElementById('hero-image').alt = ref;
        document.getElementById('hero-credit').textContent = 'Fotografía de paisaje';

        document.getElementById('devotional-verse-ref').textContent = ref;
        // The label always shows the visitor's real calendar date — it reads as
        // "today's devotional" regardless of which archive entry is displayed.
        document.getElementById('devotional-date').textContent =
            new Date(todayKey() + 'T00:00:00').toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('devotional-date').setAttribute('datetime', dateKey);

        document.getElementById('devotional-reflexion').textContent = entry.reflexion || '';
        document.getElementById('devotional-oracion').textContent = entry.oracion || '';

        if (texto) {
            const versiculoNode = document.createElement('p');
            versiculoNode.id = 'devotional-verse-quote';
            versiculoNode.className = 'italic mb-4';
            versiculoNode.style.color = 'var(--text-muted)';
            versiculoNode.textContent = `"${texto}"`;
            document.getElementById('devotional-reflexion').before(versiculoNode);
        }

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
        const requestedDate = new URL(window.location.href).searchParams.get('date');
        const dateKey = requestedDate || await resolveDefaultDate();
        await loadDate(dateKey, { pushHistory: false });

        window.addEventListener('popstate', (ev) => {
            const dk = ev.state?.dateKey || todayKey();
            loadDate(dk, { pushHistory: false });
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();

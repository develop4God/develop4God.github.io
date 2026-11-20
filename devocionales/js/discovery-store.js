(function (global) {
    'use strict';

    // Bible-study progress, favourites and "seen" state in localStorage. Key
    // names and JSON shapes mirror the Flutter app's writers
    // (discovery_progress_tracker.dart, discovery_favorites_service.dart,
    // discovery_bloc.dart) so the schema stays identical across platforms.
    const KEYS = {
        progress: (id, lang) => (lang ? `discovery_progress_${id}_${lang}` : `discovery_progress_${id}`),
        favorites: (lang) => `discovery_favorite_ids_${String(lang || 'es').split('-')[0].toLowerCase()}`,
        seen: 'discovery_seen_studies',
        swipeHint: 'discovery_swipe_hint_seen',
    };

    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

    // Guarded JSON access: every storage call may throw (blocked, full), and must never break rendering.
    function createJsonAccess(storage) {
        function read(key) {
            try {
                const raw = storage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch (_) {
                return null;
            }
        }

        function write(key, value) {
            try {
                storage.setItem(key, JSON.stringify(value));
                return true;
            } catch (_) {
                return false;
            }
        }

        function remove(key) {
            try { storage.removeItem(key); } catch (_) { /* blocked storage: nothing to remove */ }
        }

        function readSet(key) {
            const v = read(key);
            return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
        }

        return { read, write, remove, readSet };
    }

    // Section progress for one piece of content: which card sections were read and how many there are.
    // Shared by Bible studies and Encounters. `keyOf(id, lang)` names the storage key, so each consumer
    // keeps its own keys; `lang` is optional (Encounters progress is not per language).
    function createProgressStore(storage, { keyOf, now = () => new Date() } = {}) {
        const json = createJsonAccess(storage);

        // Returns the stored record (so unknown fields such as answeredQuestions survive writes).
        function readRecord(id, lang) {
            const v = json.read(keyOf(id, lang));
            return isObject(v) ? v : {};
        }

        function getProgress(id, lang) {
            const r = readRecord(id, lang);
            return {
                studyId: id,
                languageCode: lang,
                completedSections: Array.isArray(r.completedSections)
                    ? r.completedSections.filter((n) => Number.isInteger(n) && n >= 0)
                    : [],
                isCompleted: r.isCompleted === true,
                completedAt: typeof r.completedAt === 'string' ? r.completedAt : null,
                // Web-only field (the app ignores it): lets the list show done/total without loading the study.
                totalSections: Number.isInteger(r.totalSections) && r.totalSections > 0 ? r.totalSections : null,
            };
        }

        function saveProgress(id, lang, changes) {
            const record = readRecord(id, lang);
            json.write(keyOf(id, lang), { ...record, studyId: id, languageCode: lang, ...changes });
        }

        function markSectionCompleted(id, index, lang) {
            if (!Number.isInteger(index) || index < 0) return;
            const { completedSections } = getProgress(id, lang);
            if (completedSections.includes(index)) return;
            saveProgress(id, lang, { completedSections: [...completedSections, index] });
        }

        function setTotalSections(id, total, lang) {
            if (!Number.isInteger(total) || total <= 0) return;
            saveProgress(id, lang, { totalSections: total });
        }

        function completeStudy(id, lang) {
            if (getProgress(id, lang).isCompleted) return;
            saveProgress(id, lang, { isCompleted: true, completedAt: now().toISOString() });
        }

        function resetProgress(id, lang) {
            json.remove(keyOf(id, lang));
        }

        function completionPercentage(id, totalSections, lang) {
            if (!(totalSections > 0)) return 0;
            return Math.min(1, getProgress(id, lang).completedSections.length / totalSections);
        }

        return { getProgress, markSectionCompleted, setTotalSections, completeStudy, resetProgress, completionPercentage };
    }

    // Studies: progress keyed per study and language; favourites and "seen" per language / globally.
    function createDiscoveryStore(storage, now = () => new Date()) {
        const json = createJsonAccess(storage);
        const progress = createProgressStore(storage, { keyOf: KEYS.progress, now });

        const loadFavorites = (lang) => json.readSet(KEYS.favorites(lang));

        // Returns true when the study was added, false when removed or the write failed.
        function toggleFavorite(studyId, lang) {
            const ids = loadFavorites(lang);
            const added = !ids.has(studyId);
            if (added) ids.add(studyId); else ids.delete(studyId);
            return json.write(KEYS.favorites(lang), [...ids]) && added;
        }

        const loadSeen = () => json.readSet(KEYS.seen);

        function markSeen(studyId) {
            if (typeof studyId !== 'string' || !studyId) return;
            const seen = loadSeen();
            if (seen.has(studyId)) return;
            seen.add(studyId);
            json.write(KEYS.seen, [...seen]);
        }

        const hasSeenSwipeHint = () => json.read(KEYS.swipeHint) === '1';
        const markSwipeHintSeen = () => json.write(KEYS.swipeHint, '1');

        return {
            hasSeenSwipeHint, markSwipeHintSeen,
            ...progress,
            loadFavorites, toggleFavorite, loadSeen, markSeen,
        };
    }

    global.DiscoveryStore = { createDiscoveryStore, createProgressStore, KEYS };
})(window);

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
    };

    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

    // Every storage access is guarded: blocked or full storage must never break rendering.
    function createDiscoveryStore(storage, now = () => new Date()) {
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

        // Returns the stored record (so unknown fields such as answeredQuestions survive writes).
        function readProgressRecord(studyId, lang) {
            const v = read(KEYS.progress(studyId, lang));
            return isObject(v) ? v : {};
        }

        function getProgress(studyId, lang) {
            const r = readProgressRecord(studyId, lang);
            return {
                studyId,
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

        function saveProgress(studyId, lang, changes) {
            const record = readProgressRecord(studyId, lang);
            write(KEYS.progress(studyId, lang), { ...record, studyId, languageCode: lang, ...changes });
        }

        function markSectionCompleted(studyId, index, lang) {
            if (!Number.isInteger(index) || index < 0) return;
            const { completedSections } = getProgress(studyId, lang);
            if (completedSections.includes(index)) return;
            saveProgress(studyId, lang, { completedSections: [...completedSections, index] });
        }

        function setTotalSections(studyId, total, lang) {
            if (!Number.isInteger(total) || total <= 0) return;
            saveProgress(studyId, lang, { totalSections: total });
        }

        function completeStudy(studyId, lang) {
            if (getProgress(studyId, lang).isCompleted) return;
            saveProgress(studyId, lang, { isCompleted: true, completedAt: now().toISOString() });
        }

        function resetProgress(studyId, lang) {
            remove(KEYS.progress(studyId, lang));
        }

        function completionPercentage(studyId, totalSections, lang) {
            if (!(totalSections > 0)) return 0;
            return Math.min(1, getProgress(studyId, lang).completedSections.length / totalSections);
        }

        const loadFavorites = (lang) => readSet(KEYS.favorites(lang));

        // Returns true when the study was added, false when removed or the write failed.
        function toggleFavorite(studyId, lang) {
            const ids = loadFavorites(lang);
            const added = !ids.has(studyId);
            if (added) ids.add(studyId); else ids.delete(studyId);
            return write(KEYS.favorites(lang), [...ids]) && added;
        }

        const loadSeen = () => readSet(KEYS.seen);

        function markSeen(studyId) {
            if (typeof studyId !== 'string' || !studyId) return;
            const seen = loadSeen();
            if (seen.has(studyId)) return;
            seen.add(studyId);
            write(KEYS.seen, [...seen]);
        }

        return {
            getProgress, markSectionCompleted, setTotalSections, completeStudy, resetProgress, completionPercentage,
            loadFavorites, toggleFavorite, loadSeen, markSeen,
        };
    }

    global.DiscoveryStore = { createDiscoveryStore, KEYS };
})(window);

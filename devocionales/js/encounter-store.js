(function (global) {
    'use strict';

    // Completed Encounters in localStorage (web-only progress, one list of ids, not per language:
    // the app stores ids only). Storage access is StorageJson's (guarded); when a write fails the
    // ids stay in memory so the reader still unlocks the next encounter for the session.
    const KEYS = { completed: 'develop4God_encounters_completed' };

    function createEncounterStore(storage) {
        const json = global.StorageJson.createJsonStorage(storage);
        const session = new Set();

        const loadCompleted = () => new Set([...json.readSet(KEYS.completed), ...session]);

        function markCompleted(id) {
            if (typeof id !== 'string' || !id) return;
            const ids = loadCompleted();
            if (ids.has(id) && !session.has(id)) return;
            ids.add(id);
            if (json.write(KEYS.completed, [...ids])) session.clear(); else session.add(id);
        }

        const isCompleted = (id) => loadCompleted().has(id);

        return { loadCompleted, markCompleted, isCompleted };
    }

    global.EncounterStore = { createEncounterStore, KEYS };
})(window);

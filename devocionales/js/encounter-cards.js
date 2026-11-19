(function (global) {
    'use strict';

    // View-model for the Encounters list: one card state per entry, derived from the index, the
    // completed ids and the unlock-all entitlement. Pure (no DOM, no storage); the lock rule is
    // EncounterLock's. Order is never changed: completed cards stay where the index puts them.
    //   state: 'completed' | 'open' | 'locked' | 'comingSoon'
    //   badge: 'completed' | 'next' (first unfinished open card) | null
    function buildCards(entries, { completed = new Set(), allUnlocked = false } = {}) {
        if (!Array.isArray(entries)) return [];
        const list = entries.filter((x) => x && typeof x === 'object' && x.id);
        const lock = global.EncounterLock;
        const nextLockedId = (lock.firstLocked(list, completed, allUnlocked) || {}).id;
        let nextAssigned = false;

        return list.map((entry) => {
            let state = 'comingSoon';
            if (entry.isPublished) {
                if (completed.has(entry.id)) state = 'completed';
                else state = lock.isUnlocked(list, entry.id, completed, allUnlocked) ? 'open' : 'locked';
            }
            let badge = null;
            if (state === 'completed') badge = 'completed';
            else if (state === 'open' && !nextAssigned) { badge = 'next'; nextAssigned = true; }
            const prerequisite = state === 'locked' ? lock.prerequisiteOf(list, entry.id) : null;
            return {
                ...entry,
                state,
                badge,
                isNextLocked: state === 'locked' && entry.id === nextLockedId,
                prerequisiteTitle: prerequisite ? prerequisite.title : null,
            };
        });
    }

    const countPublished = (entries) => (Array.isArray(entries) ? entries.filter((x) => x && x.isPublished).length : 0);

    global.EncounterCards = { buildCards, countPublished };
})(window);

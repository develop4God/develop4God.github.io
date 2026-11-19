(function (global) {
    'use strict';

    // Sequential unlock rule for Encounters, ported from EncounterState in
    // devocional_nuevo (isUnlocked / firstLocked / getPrerequisite). Pure: no DOM,
    // no storage. `completed` is a Set of encounter ids; `allUnlocked` is the
    // "open all encounters" entitlement (the app's IAP, the web's PayPal flag).
    const published = (index) => (Array.isArray(index)
        ? index.filter((x) => x && x.id && x.status === 'published')
        : []);

    function isUnlocked(index, id, completed, allUnlocked = false) {
        if (allUnlocked) return true;
        const list = published(index);
        const position = list.findIndex((x) => x.id === id);
        if (position <= 0) return true; // first, coming_soon or unknown: own overlay decides
        return !!(completed && completed.has(list[position - 1].id));
    }

    function firstLocked(index, completed, allUnlocked = false) {
        return published(index).find((x) => !isUnlocked(index, x.id, completed, allUnlocked)) || null;
    }

    function prerequisiteOf(index, id) {
        const list = published(index);
        const position = list.findIndex((x) => x.id === id);
        return position > 0 ? list[position - 1] : null;
    }

    global.EncounterLock = { isUnlocked, firstLocked, prerequisiteOf };
})(window);

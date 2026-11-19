(function (global) {
    'use strict';

    // Maps a deep link (?id=) onto what the page shows. Input is the card list from EncounterCards
    // (already carrying each card's state), so the lock rule is applied once, there.
    //   open: reader (open and completed cards)   locked: unlock sheet   comingSoon   notFound
    const KIND_BY_STATE = { open: 'open', completed: 'open', locked: 'locked', comingSoon: 'comingSoon' };

    function routeFor(cards, id) {
        const entry = Array.isArray(cards) && typeof id === 'string' && id
            ? cards.find((c) => c && c.id === id)
            : null;
        if (!entry || !KIND_BY_STATE[entry.state]) return { kind: 'notFound' };
        return { kind: KIND_BY_STATE[entry.state], entry };
    }

    global.EncounterRoute = { routeFor };
})(window);

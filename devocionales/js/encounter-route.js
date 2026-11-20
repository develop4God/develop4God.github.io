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

    // Runs a deep link once its card list has loaded. Each call supersedes the previous one, and
    // cancel() (Back to the list) supersedes a pending one, so a late load never reopens a screen the
    // user already left. Coming-soon cards land on the list, where their badge and release date show.
    function createDeepLink({ loadCards, actions }) {
        let latest = 0;

        async function open(id) {
            const seq = ++latest;
            let cards;
            try {
                cards = await loadCards();
            } catch (_) {
                if (seq === latest) actions.showList(); // the list shows its own error with Retry
                return;
            }
            if (seq !== latest) return;
            const route = routeFor(cards, id);
            if (route.kind === 'open') actions.openReader(route.entry);
            else if (route.kind === 'locked') actions.showLocked();
            else if (route.kind === 'comingSoon') actions.showList();
            else actions.showNotFound(id);
        }

        function cancel() {
            latest += 1;
        }

        return { open, cancel };
    }

    global.EncounterRoute = { routeFor, createDeepLink };
})(window);

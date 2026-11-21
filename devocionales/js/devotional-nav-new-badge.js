(function (global) {
    'use strict';

    // The "New" bubble on the Bible-studies and Encounters tabs goes away for good once the
    // person taps that tab. The seen flag is one localStorage key per tab. Every storage call
    // is guarded: blocked storage keeps the bubble visible, it never throws.

    const KEY_PREFIX = 'devotional.newBadgeSeen.';
    const TAB_BY_HREF = {
        '/devocionales/estudios/': 'studies',
        '/devocionales/encounters/': 'encounters',
    };

    function tabForHref(href) {
        return Object.prototype.hasOwnProperty.call(TAB_BY_HREF, href) ? TAB_BY_HREF[href] : null;
    }

    function isBubbleTab(tab) {
        return Object.values(TAB_BY_HREF).includes(tab);
    }

    // Reading `window.localStorage` itself can throw (sandboxed frames, blocked cookies).
    function storageOf(win) {
        try {
            return win.localStorage || null;
        } catch (err) {
            return null;
        }
    }

    function isSeen(storage, tab) {
        if (!storage || !isBubbleTab(tab)) return false;
        try {
            return storage.getItem(KEY_PREFIX + tab) === '1';
        } catch (err) {
            return false;
        }
    }

    function markSeen(storage, tab) {
        if (!storage || !isBubbleTab(tab)) return;
        try {
            storage.setItem(KEY_PREFIX + tab, '1');
        } catch (err) {
            // Blocked storage: the bubble stays visible on the next page load.
        }
    }

    // Marks the tab as seen when its link is tapped. Shared by the static header and the installed bar.
    // A modified click (ctrl, cmd, shift, middle button) opens the tab in the background: not seen yet.
    function bindTap(link, tab, storage) {
        link.addEventListener('click', (event) => {
            if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0)) return;
            markSeen(storage, tab);
        });
    }

    // Static bubbles (browser header, Bible-studies and Encounters pages): drop the ones already
    // seen and mark a tab as seen when it is tapped.
    function wire(doc, storage) {
        doc.querySelectorAll('.nav-new-badge').forEach((badge) => {
            const link = badge.closest('a');
            const tab = link ? tabForHref(link.getAttribute('href')) : null;
            if (!tab) return;
            if (isSeen(storage, tab)) {
                badge.remove();
                return;
            }
            bindTap(link, tab, storage);
        });
    }

    global.DevotionalNewBadge = { tabForHref, storageOf, isSeen, markSeen, bindTap, wire };
    // Loaded at the end of <body>, after the static nav markup. Pages without that markup match nothing.
    if (global.document) wire(global.document, storageOf(global));
})(window);

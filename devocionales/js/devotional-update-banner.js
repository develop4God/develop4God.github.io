(function (global) {
    'use strict';

    // "A new version is available" banner. A new worker installs and waits; it takes over by itself
    // only when every tab is hidden, which a reader with a tab open may never do. The banner lets
    // the reader choose: one tap asks the waiting worker to take over (forced), and the page
    // reloads once the new worker controls it. Every open tab shows the banner: after one tab has
    // switched, the others keep running their old scripts until reloaded, so each offers the
    // reload too (and DevotionalSwRegister.reloadOnUpdate still reloads a hidden tab by itself).
    // Styling lives in pwa/shell.css (.update-banner).

    // Must equal SKIP_WAITING_MESSAGE in devotional-sw-register.js and scripts/sw.template.js
    // (scripts/sw.test.js enforces it).
    const SKIP_WAITING_MESSAGE = 'devocionales-skip-waiting';
    // How long a tap may wait for the takeover before the button is usable again.
    const REQUEST_TIMEOUT_MS = 8000;
    // How often a banner held back by the entry window checks whether the window is over.
    const ENTRY_RECHECK_MS = 1000;

    // The reader's language when available; English otherwise, and never a thrown error.
    function label(win, key, fallback) {
        try {
            const i18n = win.DevotionalI18n;
            if (i18n && typeof i18n.t === 'function') return i18n.t(key, fallback);
        } catch (err) {
            // The text is optional; the English fallback below always works.
        }
        return fallback;
    }

    // Translations load after the page: the first labels may be the English fallbacks, so the banner
    // is labelled again when they are ready and whenever the language changes. Best-effort.
    function keepLabelsCurrent(win, relabel) {
        try {
            const i18n = win.DevotionalI18n;
            if (!i18n) return;
            if (typeof i18n.whenReady === 'function') i18n.whenReady(relabel);
            if (typeof i18n.onLanguageChanged === 'function') i18n.onLanguageChanged(relabel);
        } catch (err) {
            // The banner stays in the language it was first shown in.
        }
    }

    function render(win, onUpdate) {
        const doc = win.document;
        if (!doc || !doc.body) return null;
        const message = doc.createElement('span');
        const button = doc.createElement('button');
        button.setAttribute('type', 'button');
        button.addEventListener('click', () => onUpdate(button));
        const relabel = () => {
            message.textContent = label(win, 'shell.updateAvailable', 'A new version is available');
            button.textContent = label(win, 'shell.updateAction', 'Update');
        };
        relabel();
        keepLabelsCurrent(win, relabel);
        const banner = doc.createElement('div');
        banner.className = 'update-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.append(message, button);
        doc.body.append(banner);
        return banner;
    }

    // Shows the banner whenever a worker for a new build is waiting on a page that already has a
    // worker (the first worker is an install, not an update), and in every other tab once one tab
    // has switched. `registration` comes from register(); `entry` (optional) is the page's entry
    // window: while it is open the entry flow may be taking over by itself, so the banner waits.
    function watch(win, registration, entry) {
        const container = win.navigator && win.navigator.serviceWorker;
        if (!container || !registration) return;
        const setTimer = win.setTimeout ? win.setTimeout.bind(win) : setTimeout;
        const clearTimer = win.clearTimeout ? win.clearTimeout.bind(win) : clearTimeout;
        const hadController = Boolean(container.controller);
        let shown = false;
        let requested = false;
        let timer = null;
        let reloaded = false;

        const reload = () => {
            if (reloaded) return;
            reloaded = true;
            win.location.reload();
        };

        const release = (button) => {
            requested = false;
            button.disabled = false;
            button.setAttribute('aria-busy', 'false');
        };

        const requestUpdate = (button) => {
            if (requested) return;
            requested = true;
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            const waiting = registration.waiting;
            if (!waiting) {
                // Another tab already switched: this page only needs the new files.
                reload();
                return;
            }
            // Whichever comes first: the page's controller changes, or the worker reports it is active.
            container.addEventListener('controllerchange', reload);
            waiting.addEventListener('statechange', () => {
                if (waiting.state === 'activated') reload();
                else if (waiting.state === 'redundant') release(button);
            });
            // If no takeover follows (the worker was dropped, or the message was lost), the reader can retry.
            timer = setTimer(() => release(button), REQUEST_TIMEOUT_MS);
            waiting.postMessage({ type: SKIP_WAITING_MESSAGE, force: true });
        };

        const display = () => {
            if (shown) return;
            shown = render(win, requestUpdate) !== null;
        };

        const show = () => {
            if (shown || !registration.waiting || !container.controller) return;
            if (entry && entry.isOpen()) {
                // The entry flow may take over by itself: look again when its window has passed.
                setTimer(show, ENTRY_RECHECK_MS);
                return;
            }
            display();
        };

        registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
                if (installing.state === 'installed') show();
            });
        });
        // Another tab switched the build under this page: offer the reload here too. A first worker
        // claiming a page that had none is not an update.
        container.addEventListener('controllerchange', () => {
            if (hadController && !requested) display();
            if (timer !== null) clearTimer(timer);
        });
        show();
    }

    global.DevotionalUpdateBanner = { watch, SKIP_WAITING_MESSAGE, REQUEST_TIMEOUT_MS, ENTRY_RECHECK_MS };
})(window);

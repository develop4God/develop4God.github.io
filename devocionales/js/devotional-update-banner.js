(function (global) {
    'use strict';

    // "A new version is available" banner. A new worker installs and waits; it takes over by itself
    // only when every tab is hidden, which a reader with a tab open may never do. The banner lets
    // the reader choose: one tap asks the waiting worker to take over (forced), and the page
    // reloads once the new worker controls it. Other open tabs still reload only once hidden
    // (DevotionalSwRegister.reloadOnUpdate). Styling lives in chrome.css (.update-banner).

    // Must equal SKIP_WAITING_MESSAGE in devotional-sw-register.js and scripts/sw.template.js.
    const SKIP_WAITING_MESSAGE = 'devocionales-skip-waiting';

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

    function render(win, onUpdate) {
        const doc = win.document;
        if (!doc || !doc.body) return null;
        const message = doc.createElement('span');
        message.textContent = label(win, 'shell.updateAvailable', 'A new version is available');
        const button = doc.createElement('button');
        button.setAttribute('type', 'button');
        button.textContent = label(win, 'shell.updateAction', 'Update');
        button.addEventListener('click', () => onUpdate(button));
        const banner = doc.createElement('div');
        banner.className = 'update-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.append(message, button);
        doc.body.append(banner);
        return banner;
    }

    // Shows the banner whenever a worker for a new build is waiting on a page that already has a
    // worker (the first worker is an install, not an update). `registration` comes from register().
    function watch(win, registration) {
        const container = win.navigator && win.navigator.serviceWorker;
        if (!container || !registration) return;
        let shown = false;
        let requested = false;

        const requestUpdate = (button) => {
            if (requested) return;
            requested = true;
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            const waiting = registration.waiting;
            if (!waiting) {
                // Another tab already switched: this page only needs the new files.
                win.location.reload();
                return;
            }
            container.addEventListener('controllerchange', () => win.location.reload());
            waiting.postMessage({ type: SKIP_WAITING_MESSAGE, force: true });
        };

        const show = () => {
            if (shown || !registration.waiting || !container.controller) return;
            shown = render(win, requestUpdate) !== null;
        };

        registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
                if (installing.state === 'installed') show();
            });
        });
        show();
    }

    global.DevotionalUpdateBanner = { watch, SKIP_WAITING_MESSAGE };
})(window);

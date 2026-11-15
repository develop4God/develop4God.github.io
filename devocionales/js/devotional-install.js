(function (global) {
    'use strict';

    // Platform detection lives in DevotionalStandalone. If that script failed to load, the platform
    // is treated as not Android and nothing here throws.
    function isAndroid(win) {
        return Boolean(win.DevotionalStandalone && win.DevotionalStandalone.isAndroid(win.navigator));
    }

    function reveal(element) {
        if (!element) return;
        element.classList.remove('hidden');
        element.classList.add('inline-flex');
    }

    // Google Play download button: Android only (every other platform gets the PWA instead).
    function showAndroidDownload(doc, win) {
        if (isAndroid(win)) reveal(doc.getElementById('download-app-android-btn'));
    }

    // "Install app" button. It is hidden in the HTML and shown only once the browser reports that
    // the page is installable (`beforeinstallprompt`), so it never appears where installing is
    // impossible or after the app is already installed. A tap opens the browser's own prompt.
    // `config` is DevotionalPwaConfig: `enabled` false turns the feature off entirely; absent, the
    // feature is on. Android never gets the button: the native app is the offer there.
    function init(doc, win, config) {
        // First, so nothing below (no install button, PWA switched off) can keep it from running.
        showAndroidDownload(doc, win);
        const button = doc.querySelector('[data-install]');
        if (!button) return;
        if (config && config.enabled === false) return;
        const withheld = isAndroid(win);
        let deferred = null;
        const show = () => reveal(button);
        const hide = () => {
            button.classList.add('hidden');
            button.classList.remove('inline-flex');
        };
        win.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault(); // also keeps the browser's own banner off where it is withheld
            if (withheld) return;
            deferred = event;
            show();
        });
        win.addEventListener('appinstalled', () => {
            deferred = null;
            hide();
        });
        button.addEventListener('click', async () => {
            const event = deferred;
            if (!event) return;
            deferred = null; // a prompt event can be used only once, whatever the answer
            try {
                await event.prompt();
                await event.userChoice;
            } catch (err) {
                // The browser refused to show the prompt.
            }
            // Accepted, dismissed or refused, the event is used up and a button without a usable
            // prompt behind it would be dead: hide it. The browser's next beforeinstallprompt
            // shows it again, and an offer that arrived while the prompt was open is kept.
            if (!deferred) hide();
        });
    }

    global.DevotionalInstall = { init, showAndroidDownload };
})(window);

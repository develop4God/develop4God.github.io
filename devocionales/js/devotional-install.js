(function (global) {
    'use strict';

    // Android users have the native app (see the Google Play banner), so the web app is offered
    // everywhere else. Client hints give the platform when the browser reports it; the user agent
    // covers Chrome, Firefox and Samsung Internet on Android.
    function isAndroid(nav) {
        if (!nav) return false;
        if (nav.userAgentData && String(nav.userAgentData.platform).toLowerCase() === 'android') return true;
        return /Android/i.test(nav.userAgent || '');
    }

    function reveal(element) {
        if (!element) return;
        element.classList.remove('hidden');
        element.classList.add('inline-flex');
    }

    // Google Play download button: Android only (every other platform gets the PWA instead).
    function showAndroidDownload(doc, win) {
        if (isAndroid(win.navigator)) reveal(doc.getElementById('download-app-android-btn'));
    }

    // "Install app" button. It is hidden in the HTML and shown only once the browser reports that
    // the page is installable (`beforeinstallprompt`), so it never appears where installing is
    // impossible or after the app is already installed. A tap opens the browser's own prompt.
    // `config` is DevotionalPwaConfig: `enabled` false turns the feature off entirely, and
    // `installOnAndroid` true offers the web app on Android as well. Both default to the
    // behaviour described above when absent.
    function init(doc, win, config) {
        // First, so nothing below (no install button, PWA switched off) can keep it from running.
        showAndroidDownload(doc, win);
        const button = doc.querySelector('[data-install]');
        if (!button) return;
        if (config && config.enabled === false) return;
        const withheld = isAndroid(win.navigator) && !(config && config.installOnAndroid === true);
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

    global.DevotionalInstall = { init, isAndroid, showAndroidDownload };
})(window);

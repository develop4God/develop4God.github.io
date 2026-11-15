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

    // "Install app" button. It is hidden in the HTML and shown only once the browser reports that
    // the page is installable (`beforeinstallprompt`), so it never appears where installing is
    // impossible or after the app is already installed. A tap opens the browser's own prompt.
    // `config` is DevotionalPwaConfig: `enabled` false turns the feature off entirely, and
    // `installOnAndroid` true offers the web app on Android as well. Both default to the
    // behaviour described above when absent.
    function init(doc, win, config) {
        const button = doc.querySelector('[data-install]');
        if (!button) return;
        if (config && config.enabled === false) return;
        const withheld = isAndroid(win.navigator) && !(config && config.installOnAndroid === true);
        let deferred = null;
        const show = () => {
            button.classList.remove('hidden');
            button.classList.add('inline-flex');
        };
        const hide = () => {
            deferred = null;
            button.classList.add('hidden');
            button.classList.remove('inline-flex');
        };
        win.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault(); // also keeps the browser's own banner off where it is withheld
            if (withheld) return;
            deferred = event;
            show();
        });
        win.addEventListener('appinstalled', hide);
        button.addEventListener('click', async () => {
            const event = deferred;
            if (!event) return;
            hide(); // a prompt event can be used only once, whatever the answer
            try {
                await event.prompt();
                await event.userChoice;
            } catch (err) {
                // The browser refused to show the prompt; the button stays hidden until it offers another.
            }
        });
    }

    global.DevotionalInstall = { init, isAndroid };
})(window);

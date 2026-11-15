(function (global) {
    'use strict';

    // iOS has no install button: Safari offers no install event, so the only way to install the
    // web app is Share > Add to Home Screen. This shows a dismissible hint saying so, in iOS
    // browsers where the app is not installed yet. Its own module so the install button logic
    // (devotional-install.js) stays about the browser's install prompt.

    const DISMISSED_KEY = 'devocionalesIosHintDismissed';

    function isIos(nav) {
        if (!nav) return false;
        if (/iPhone|iPad|iPod/.test(nav.userAgent || '')) return true;
        // iPadOS reports a Mac user agent; its touch screen tells it apart from a real Mac.
        return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
    }

    // Safari, Chrome and Firefox on iOS carry a `Safari/` token in their user agent and have
    // Share > Add to Home Screen. The web views inside other apps (Facebook, Instagram, mail
    // apps) do not carry it and cannot install anything, so they get no hint.
    function canAddToHomeScreen(nav) {
        return isIos(nav) && /Safari\//.test(nav.userAgent || '');
    }

    // Launched from the home screen: `navigator.standalone` on iOS, the display-mode query elsewhere.
    function isStandalone(win) {
        if (win.navigator && win.navigator.standalone === true) return true;
        return typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
    }

    function wasDismissed(win) {
        try {
            return win.localStorage.getItem(DISMISSED_KEY) === '1';
        } catch (err) {
            return false; // unusable storage (private mode): show the hint rather than hide it forever
        }
    }

    function remember(win) {
        try {
            win.localStorage.setItem(DISMISSED_KEY, '1');
        } catch (err) {
            // Not remembered; the hint is hidden for this page view anyway.
        }
    }

    // `config` is DevotionalPwaConfig: only an explicit `enabled: false` switches the hint off.
    function init(doc, win, config) {
        const hint = doc.querySelector('[data-ios-hint]');
        if (!hint) return;
        if (config && config.enabled === false) return;
        if (!canAddToHomeScreen(win.navigator) || isStandalone(win) || wasDismissed(win)) return;
        hint.classList.remove('hidden');
        const close = doc.querySelector('[data-ios-hint-close]');
        if (close) {
            close.addEventListener('click', () => {
                hint.classList.add('hidden');
                remember(win);
            });
        }
    }

    global.DevotionalIosHint = { init, isIos, isStandalone, canAddToHomeScreen };
})(window);

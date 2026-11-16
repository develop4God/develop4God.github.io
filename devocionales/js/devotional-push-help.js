(function (global) {
    'use strict';

    // When the browser has blocked notifications, the reader has to change a setting outside the
    // page, and where that setting lives depends on the platform. This picks which steps to show.
    // Pure: it only reads the navigator it is given.

    // The translation key of the steps for this platform, or null where push is never offered
    // (Android has the native app), or when the platform cannot be told (a page cached without the iOS
    // check): the caller then shows the generic text.
    function helpKey(nav) {
        const standalone = global.DevotionalStandalone;
        if (standalone && typeof standalone.isAndroid === 'function' && standalone.isAndroid(nav)) return null;
        const hint = global.DevotionalIosHint;
        // Without the iOS check an iPhone cannot be told from a desktop, and the desktop steps do not exist on iOS.
        if (!hint || typeof hint.isIos !== 'function') return null;
        return hint.isIos(nav) ? 'push.blocked_ios' : 'push.blocked_desktop';
    }

    global.DevotionalPushHelp = { helpKey };
})(window);

(function (global) {
    'use strict';

    // Platform facts shared by the install, manifest and push modules, kept apart so none of them
    // depends on another feature's module for them.

    // Android users have the native app (see the Google Play banner), so the web app is not
    // offered there. Client hints give the platform when the browser reports it; the user agent
    // covers Chrome, Firefox and Samsung Internet on Android.
    function isAndroid(nav) {
        if (!nav) return false;
        if (nav.userAgentData && String(nav.userAgentData.platform).toLowerCase() === 'android') return true;
        return /Android/i.test(nav.userAgent || '');
    }

    global.DevotionalPlatform = { isAndroid };
})(window);

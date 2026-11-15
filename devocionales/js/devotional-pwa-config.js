(function (global) {
    'use strict';

    // The one place to switch the devocionales PWA features. It is a precached script, so a change
    // here reaches readers through the normal worker update (scripts/build-sw.js picks it up).
    global.DevotionalPwaConfig = Object.freeze({
        // Master switch. false = no service worker, no install button, no manifest, and any worker
        // or cache already installed in a reader's browser is removed on their next visit.
        enabled: true,
        // The native Android app is the offer on Android. Set true to offer the web app there too.
        installOnAndroid: false,
    });
})(window);

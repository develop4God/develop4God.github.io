(function (global) {
    'use strict';

    // The one place to switch the devocionales PWA features. The service worker fetches this file
    // fresh first, so a change reaches an online reader on their next visit; an offline reader
    // keeps the last copy until they are online again. Deploy it like any other file.
    global.DevotionalPwaConfig = Object.freeze({
        // Master switch. false = no service worker, no install button, no manifest, and any worker
        // or cache already installed in a reader's browser is removed on their next visit.
        enabled: true,
        // The native Android app is the offer on Android. Set true to offer the web app there too.
        installOnAndroid: false,
    });
})(window);

(function () {
    'use strict';

    // Starts the service worker logic (update on entry, kill switch) on the pages that have no inline
    // boot of their own: Encounters and Bible studies. Without it a reader who opens the app on one
    // of them never receives a new build. The reader page does the same from its own boot list.
    try {
        window.DevotionalSwRegister.start(window, '/devocionales/sw.js', '/devocionales/', window.DevotionalPwaConfig);
    } catch (err) {
        // The page works without the worker; a failure here must never surface.
    }
})();

(function (global) {
    'use strict';

    // Single seam for reporting reader errors to analytics — devotional-loader.js
    // calls logError(), never gtag directly, so the transport (gtag today,
    // Firestore or another service later) can change without touching call
    // sites. Mirrors the devotional-i18n-adapter.js seam pattern.
    function logError(errorType, details = {}) {
        if (typeof global.gtag !== 'function') return;
        global.gtag('event', 'devotional_load_failed', {
            error_type: errorType,
            ...details,
        });
    }

    global.DevotionalErrorLogger = { logError };
})(window);

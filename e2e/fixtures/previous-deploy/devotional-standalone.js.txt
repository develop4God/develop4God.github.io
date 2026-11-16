(function (global) {
    'use strict';

    // Detects the installed app and keeps it inside its scope (/devocionales/, see the manifest).
    // A link that leaves the scope would open the browser's own chrome over the app, so in the
    // installed app every link to the home page is made inert: unlike pointer-events:none, that
    // also takes it out of the keyboard and screen-reader paths.

    // Launched from the home screen: `navigator.standalone` on iOS, the display-mode query elsewhere.
    function isStandalone(win) {
        if (win.navigator && win.navigator.standalone === true) return true;
        return typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
    }

    // Sets `is-standalone` on <html> (CSS hooks) and returns whether this is the installed app.
    function apply(doc, win) {
        if (!isStandalone(win)) return false;
        doc.documentElement.classList.add('is-standalone');
        doc.querySelectorAll('a[href="/"]').forEach((link) => { link.inert = true; });
        return true;
    }

    global.DevotionalStandalone = { isStandalone, apply };
})(window);

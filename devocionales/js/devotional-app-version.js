(function (global) {
    'use strict';

    // Shows the app version from the config (devotional-pwa-config.js, e.g. "1.0.1+1") in the Settings
    // tab, with the build id (devotional-build.js, a content hash regenerated on every build) beside it,
    // so a reader and support can tell which release and which build the installed app is on. A config
    // without a version or a page without the element (an older cached page) is left alone; a page
    // without the build stamp or the build element just shows the version.
    function render() {
        const config = global.DevotionalPwaConfig;
        const build = global.DevotionalBuild;
        const doc = global.document;
        const element = doc.querySelector('[data-app-version]');
        if (!element || !config || typeof config.appVersion !== 'string' || config.appVersion === '') return false;
        element.textContent = config.appVersion;
        const buildElement = doc.querySelector('[data-app-build]');
        if (buildElement && build && typeof build.id === 'string' && build.id !== '') buildElement.textContent = build.id;
        return true;
    }

    global.DevotionalAppVersion = { render };
    render();
})(window);

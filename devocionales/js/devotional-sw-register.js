(function (global) {
    'use strict';

    // Registers the service worker and runs the PWA kill switch. Its own module so
    // devotional-loader.js does not grow another concern; see .claude/skills/web-coding-agent/SKILL.md Step 4 (SOLID-lite).

    // Resolves to null when service workers are unsupported or registration fails: the page works
    // without the worker, so a failure here must never surface as an error.
    // updateViaCache 'none' makes update checks bypass the HTTP cache, which GitHub Pages sets to
    // ten minutes for every file.
    function register(nav, url, scope) {
        if (!nav || !('serviceWorker' in nav)) return Promise.resolve(null);
        try {
            return Promise.resolve(nav.serviceWorker.register(url, { scope, updateViaCache: 'none' })).catch(() => null);
        } catch (err) {
            return Promise.resolve(null);
        }
    }

    // Must equal CACHE_PREFIX in scripts/sw.template.js (scripts/sw.test.js enforces it).
    const CACHE_PREFIX = 'devocionales-';
    const DISABLED_CACHE = `${CACHE_PREFIX}disabled`;

    // Must equal STAND_DOWN_MESSAGE in scripts/sw.template.js (scripts/sw.test.js enforces it).
    const STAND_DOWN_MESSAGE = 'devocionales-stand-down';

    // This app's registrations and build caches, each [] when the browser cannot say.
    async function installedRegistrations(win, scope) {
        try {
            const container = win.navigator && win.navigator.serviceWorker;
            if (!container || typeof container.getRegistrations !== 'function') return [];
            return (await container.getRegistrations()).filter((registration) => new URL(registration.scope).pathname === scope);
        } catch (err) {
            return [];
        }
    }

    async function installedCacheNames(win) {
        try {
            if (!win.caches) return [];
            return (await win.caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX) && name !== DISABLED_CACHE);
        } catch (err) {
            return [];
        }
    }

    // The kill switch: removes this app's worker and caches from the reader's browser and drops the
    // manifest link so the page stops being installable. Each step is best-effort, because there is
    // nothing useful to do when one fails. It does the removal only when a registration or a build
    // cache exists, so a visitor who never had the app gets no marker cache and no sweep.
    // The marker cache goes first and the running worker is told to stand down: an unregistered
    // worker keeps controlling this page until it closes, and must not recreate what is deleted
    // below. A newer worker deletes the marker when it activates, which is how the PWA is re-enabled.
    async function disable(win, scope) {
        const manifest = win.document && win.document.querySelector('link[rel="manifest"]');
        if (manifest) manifest.remove();
        const registrations = await installedRegistrations(win, scope);
        const controller = win.navigator && win.navigator.serviceWorker && win.navigator.serviceWorker.controller;
        // A controlled page has a worker even when the registrations could not be listed.
        if (!controller && registrations.length === 0 && (await installedCacheNames(win)).length === 0) return;
        try {
            if (win.caches) await win.caches.open(DISABLED_CACHE);
        } catch (err) {
            // Without the marker the worker may recreate a cache; the rest still helps.
        }
        // Through the registrations and through the page's own controller, so one failing lookup
        // cannot leave the worker running; a worker that still misses both re-checks the marker.
        for (const worker of [controller, ...registrations.map((registration) => registration.active)]) {
            try {
                if (worker) worker.postMessage({ type: STAND_DOWN_MESSAGE });
            } catch (err) {
                // The worker is already gone.
            }
        }
        try {
            await Promise.all(registrations.map((registration) => registration.unregister()));
        } catch (err) {
            // Nothing to remove, or the browser refused.
        }
        try {
            await Promise.all((await installedCacheNames(win)).map((name) => win.caches.delete(name)));
        } catch (err) {
            // Same: best effort.
        }
    }

    // A worker refuses to install while the marker exists, so an enabled page removes it first. If
    // the delete fails registration goes ahead anyway and the next page view tries again.
    async function clearStandDownMarker(win) {
        try {
            if (win.caches) await win.caches.delete(DISABLED_CACHE);
        } catch (err) {
            // Best effort.
        }
    }

    // Registers once the page has loaded, so the worker never competes with the first paint.
    // `config` is DevotionalPwaConfig; only an explicit `enabled: false` switches the PWA off.
    function start(win, workerUrl, scope, config) {
        if (config && config.enabled === false) {
            disable(win, scope);
            return;
        }
        // A worker refuses to install while the stand-down marker exists, so an enabled page
        // removes any marker a previous switch-off left behind before it registers.
        const registerWorker = () => clearStandDownMarker(win).then(() => register(win.navigator, workerUrl, scope));
        if (win.document.readyState === 'complete') registerWorker();
        else win.addEventListener('load', registerWorker);
    }

    global.DevotionalSwRegister = { register, start, disable };
})(window);

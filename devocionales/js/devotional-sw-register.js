(function (global) {
    'use strict';

    // Registers the service worker and reloads the page after a deploy, without ever
    // interrupting a reader. Its own module so devotional-loader.js does not grow another concern;
    // see .claude/skills/web-coding-agent/SKILL.md Step 4 (SOLID-lite).

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

    // After a deploy the new worker takes over a page that was loaded with the old build's
    // scripts. Reload once when that happens, but never under the reader's eyes: a visible tab
    // waits until it is hidden. Whether a change is an update is decided when it fires: the first
    // change of a page that started without a worker is that worker claiming it (nothing is
    // stale), every later one is a deploy.
    function reloadOnUpdate(nav, doc, reload) {
        const container = nav && nav.serviceWorker;
        if (!container) return;
        let controlled = Boolean(container.controller);
        let waiting = false;
        const reloadWhenHidden = () => {
            if (doc.visibilityState !== 'hidden') return;
            doc.removeEventListener('visibilitychange', reloadWhenHidden);
            reload();
        };
        container.addEventListener('controllerchange', () => {
            const update = controlled;
            controlled = true;
            if (!update || waiting) return;
            waiting = true;
            doc.addEventListener('visibilitychange', reloadWhenHidden);
            reloadWhenHidden();
        });
    }

    // Must equal CACHE_PREFIX in scripts/sw.template.js (scripts/sw.test.js enforces it).
    const CACHE_PREFIX = 'devocionales-';
    const DISABLED_CACHE = `${CACHE_PREFIX}disabled`;

    // The kill switch: removes this app's worker and caches from the reader's browser and drops the
    // manifest link so the page stops being installable. Each step is best-effort, because there is
    // nothing useful to do when one fails.
    // The marker cache goes first: an unregistered worker keeps controlling this page until it
    // closes, and the marker tells it to stop saving, so it cannot recreate what is deleted below.
    // A newer worker deletes the marker when it activates, which is how the PWA is re-enabled.
    async function disable(win, scope) {
        const manifest = win.document && win.document.querySelector('link[rel="manifest"]');
        if (manifest) manifest.remove();
        try {
            if (win.caches) await win.caches.open(DISABLED_CACHE);
        } catch (err) {
            // Without the marker the worker may recreate a cache; the rest still helps.
        }
        try {
            const container = win.navigator && win.navigator.serviceWorker;
            if (container && typeof container.getRegistrations === 'function') {
                const registrations = await container.getRegistrations();
                await Promise.all(registrations
                    .filter((registration) => new URL(registration.scope).pathname === scope)
                    .map((registration) => registration.unregister()));
            }
        } catch (err) {
            // Nothing to remove, or the browser refused.
        }
        try {
            if (win.caches) {
                const names = await win.caches.keys();
                await Promise.all(names
                    .filter((name) => name.startsWith(CACHE_PREFIX) && name !== DISABLED_CACHE)
                    .map((name) => win.caches.delete(name)));
            }
        } catch (err) {
            // Same: best effort.
        }
    }

    async function clearStandDownMarker(win) {
        try {
            if (win.caches) await win.caches.delete(DISABLED_CACHE);
        } catch (err) {
            // Best effort: a leftover marker only delays the next install.
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
        reloadOnUpdate(win.navigator, win.document, () => win.location.reload());
    }

    global.DevotionalSwRegister = { register, reloadOnUpdate, start, disable };
})(window);

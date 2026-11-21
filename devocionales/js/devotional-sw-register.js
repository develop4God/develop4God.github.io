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

    // Must equal CACHE_PREFIX in scripts/sw.template.js (scripts/sw.test.js enforces it), and so
    // must the two message types.
    const CACHE_PREFIX = 'devocionales-';
    const DISABLED_CACHE = `${CACHE_PREFIX}disabled`;
    const SKIP_WAITING_MESSAGE = 'devocionales-skip-waiting';
    const BUILD_QUERY_MESSAGE = 'devocionales-build?';

    // Before the first worker claims the pages that loaded without one, it asks each which build
    // it runs. A page answers with the id in its build stamp (devotional-build.js); a page without
    // one stays silent, which keeps it from being claimed.
    function answerBuildQueries(nav, win) {
        const container = nav && nav.serviceWorker;
        if (!container) return;
        container.addEventListener('message', (event) => {
            const id = win.DevotionalBuild && win.DevotionalBuild.id;
            if (!event.data || event.data.type !== BUILD_QUERY_MESSAGE || !id || !event.ports || !event.ports[0]) return;
            event.ports[0].postMessage(id);
        });
        if (typeof container.startMessages === 'function') container.startMessages();
    }

    // "Update on entry": for the first seconds of a page, the reader has not started anything on it,
    // so a new build may replace it right away (one quick reload) instead of waiting for the tab to
    // be hidden. A takeover requested inside the window is latched for a grace period, so the reload
    // still happens when the worker answers after the window closed; the latch expires, because a
    // declined request (another tab was visible) must not keep this tab open to a takeover for good.
    // Without performance.now the window never opens.
    const ENTRY_WINDOW_MS = 8000;
    const ENTRY_LATCH_MS = 10000;

    function createEntryWindow(perf, windowMs) {
        let latchedAt = null;
        const now = () => (perf && typeof perf.now === 'function' ? perf.now() : null);
        return {
            isOpen() {
                const t = now();
                if (t === null) return false;
                return t < windowMs || (latchedAt !== null && t < latchedAt + ENTRY_LATCH_MS);
            },
            latch() { latchedAt = now(); },
        };
    }

    const NO_ENTRY_WINDOW = { isOpen: () => false, latch() {} };

    // A worker for a new build installs and waits. This page runs the old build, so it asks the
    // waiting worker to take over, but only while its own tab is hidden (the worker also checks
    // every other tab); a declined request is repeated the next time the tab is hidden. The first
    // worker (the page has no controller yet) is not an update and is never asked.
    function deliverUpdates(nav, doc, registration, entry = NO_ENTRY_WINDOW) {
        const container = nav && nav.serviceWorker;
        if (!container || !registration) return;
        const askIfHidden = () => {
            if (!container.controller || !registration.waiting) return;
            if (doc.visibilityState === 'hidden') {
                registration.waiting.postMessage({ type: SKIP_WAITING_MESSAGE });
            } else if (entry.isOpen()) {
                entry.latch();
                registration.waiting.postMessage({ type: SKIP_WAITING_MESSAGE, entry: true });
            }
        };
        doc.addEventListener('visibilitychange', askIfHidden);
        registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
                if (installing.state === 'installed') askIfHidden();
            });
        });
        askIfHidden();
    }

    // When the new worker takes over a page that was loaded with the old build's scripts, reload
    // once, but never under the reader's eyes: a visible tab waits until it is hidden. Whether a
    // change is an update is decided when it fires: the first change of a page that started
    // without a worker is that worker claiming it (nothing is stale), every later one is a deploy.
    function reloadOnUpdate(nav, doc, reload, entry = NO_ENTRY_WINDOW) {
        const container = nav && nav.serviceWorker;
        if (!container) return;
        let controlled = Boolean(container.controller);
        let waiting = false;
        const reloadWhenHidden = () => {
            if (doc.visibilityState !== 'hidden' && !entry.isOpen()) return;
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
    // The marker cache goes first. It is all a worker needs: an unregistered worker keeps
    // controlling this page, and one may still be installing, but every cache write the worker
    // makes is refused (and undone) while the marker exists, so nothing deleted below comes back.
    // The marker stays until an enabled page deletes it, just before it registers a worker.
    async function disable(win, scope) {
        const manifest = win.document && win.document.querySelector('link[rel="manifest"]');
        if (manifest) manifest.remove();
        const registrations = await installedRegistrations(win, scope);
        if (registrations.length === 0 && (await installedCacheNames(win)).length === 0) return;
        try {
            if (win.caches) await win.caches.open(DISABLED_CACHE);
        } catch (err) {
            // Without the marker the worker may recreate a cache; the rest still helps.
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
        answerBuildQueries(win.navigator, win);
        const entry = createEntryWindow(win.performance, ENTRY_WINDOW_MS);
        reloadOnUpdate(win.navigator, win.document, () => win.location.reload(), entry);
        const registerWorker = () => clearStandDownMarker(win)
            .then(() => register(win.navigator, workerUrl, scope))
            .then((registration) => {
                deliverUpdates(win.navigator, win.document, registration, entry);
                // Checks the server for a newer build on entry (devotional-update-check.js), when loaded.
                if (win.DevotionalUpdateCheck) win.DevotionalUpdateCheck.checkForNewBuild(win, registration, entry).catch(() => {});
            });
        if (win.document.readyState === 'complete') registerWorker();
        else win.addEventListener('load', registerWorker);
    }

    global.DevotionalSwRegister = { register, reloadOnUpdate, deliverUpdates, answerBuildQueries, createEntryWindow, start, disable };
})(window);

(function (global) {
    'use strict';

    // "Update on entry", checked against the server. The build stamp (devotional-build.js) says which
    // build this page runs; devocionales/version.json says which build the site serves now, and it is
    // fetched past every cache. When they differ, the page asks the browser to look for the new worker
    // at once and, if the reader only just opened the page, lets the new worker take over as soon as it
    // has downloaded, however long that takes. The reload itself is still done by reloadOnUpdate.
    // Pages the reader has already used are left to deliverUpdates, which waits for the tab to be hidden.

    const VERSION_URL = '/devocionales/version.json';
    // Must equal SKIP_WAITING_MESSAGE in devotional-sw-register.js and scripts/sw.template.js.
    const SKIP_WAITING_MESSAGE = 'devocionales-skip-waiting';
    const CHECK_TIMEOUT_MS = 1000;

    // The build id the server serves, or null when it cannot be read in time (offline included).
    async function fetchServerBuildId(win) {
        const controller = typeof win.AbortController === 'function' ? new win.AbortController() : null;
        const timer = setTimeout(() => { if (controller) controller.abort(); }, CHECK_TIMEOUT_MS);
        try {
            const response = await win.fetch(VERSION_URL, { cache: 'no-store', signal: controller ? controller.signal : undefined });
            if (!response.ok) return null;
            const body = await response.json();
            return body && typeof body.id === 'string' && body.id !== '' ? body.id : null;
        } catch (err) {
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    // A short "Updating…" note, in the reader's language, shown while the new build is fetched and
    // swapped in. Best-effort: without the toast or the translation the update still happens.
    function announceUpdate(win) {
        try {
            if (!win.UiToast || !win.document || !win.document.body) return;
            const i18n = win.DevotionalI18n;
            const text = i18n && typeof i18n.t === 'function' ? i18n.t('shell.updating', 'Updating…') : 'Updating…';
            win.UiToast.createToast({ document: win.document, container: win.document.body }).show(text);
        } catch (err) {
            // The note is optional.
        }
    }

    // True only when both ids are known and differ: an unknown build is never treated as stale.
    function isNewer(pageId, serverId) {
        return Boolean(pageId) && Boolean(serverId) && pageId !== serverId;
    }

    // Resolves to true when a newer build was found and the worker was asked to take over.
    async function checkForNewBuild(win, registration, entry) {
        if (!registration || !entry) return false;
        const pageId = win.DevotionalBuild && win.DevotionalBuild.id;
        const serverId = await fetchServerBuildId(win);
        if (!isNewer(pageId, serverId) || !entry.isOpen()) return false;
        announceUpdate(win);

        // Asks the waiting worker to take over. The entry latch keeps the page open to the reload
        // that follows the takeover, even though the download may have taken longer than the window.
        const askWhenWaiting = () => {
            if (!registration.waiting) return false;
            entry.latch();
            registration.waiting.postMessage({ type: SKIP_WAITING_MESSAGE, entry: true });
            return true;
        };
        if (askWhenWaiting()) return true;
        // A worker that is already installing when the check runs fires no updatefound for us, so
        // it is watched directly as well as through the next updatefound.
        const watch = (installing) => {
            if (!installing) return;
            installing.addEventListener('statechange', () => {
                if (installing.state === 'installed') askWhenWaiting();
            });
        };
        watch(registration.installing);
        registration.addEventListener('updatefound', () => watch(registration.installing));
        try {
            await registration.update();
        } catch (err) {
            return false;
        }
        return true;
    }

    global.DevotionalUpdateCheck = { checkForNewBuild, isNewer, fetchServerBuildId };
})(window);

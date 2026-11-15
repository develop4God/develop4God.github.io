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

    // Registers once the page has loaded, so the worker never competes with the first paint.
    function start(win, workerUrl, scope) {
        const registerWorker = () => register(win.navigator, workerUrl, scope);
        if (win.document.readyState === 'complete') registerWorker();
        else win.addEventListener('load', registerWorker);
        reloadOnUpdate(win.navigator, win.document, () => win.location.reload());
    }

    global.DevotionalSwRegister = { register, reloadOnUpdate, start };
})(window);

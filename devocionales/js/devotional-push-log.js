(function (global) {
    'use strict';

    // Opt-in debug trail for the push flow, whose failures are otherwise silent by design (the page
    // must work the same without push). Off unless the page is opened with ?pushdebug=1 or
    // localStorage "devotionalPush.debug" is "1". When on, each step is printed as "[push] step" and kept
    // in window.__pushLog (last 100) so a test or a remote-debugging session can read it. It never
    // throws. Callers pass only step names, results and error messages; long id-like strings are
    // redacted as a backstop. ?pushdebug=0 removes the stored flag (an installed app has no way to edit it).

    const FLAG_KEY = 'devotionalPush.debug';
    const MAX_ENTRIES = 100;

    function isOn(win) {
        try {
            if (/(^|[?&])pushdebug=0(&|$)/.test((win.location && win.location.search) || '')) {
                win.localStorage.removeItem(FLAG_KEY);
                return false;
            }
            if (/(^|[?&])pushdebug=1(&|$)/.test((win.location && win.location.search) || '')) {
                // Kept, so the installed app (no URL bar; a desktop tab shares its storage) logs on later visits too.
                try { win.localStorage.setItem(FLAG_KEY, '1'); } catch (err) { /* blocked storage: on for this visit only */ }
                return true;
            }
            return win.localStorage.getItem(FLAG_KEY) === '1';
        } catch (err) {
            return false;
        }
    }

    // A run of 40+ id characters (FCM tokens, installation ids, API keys) is never worth keeping.
    const redact = (text) => text.replace(/[A-Za-z0-9_:.-]{40,}/g, '[redacted]');
    const MAX_DEPTH = 4;

    // A copy that is safe to print and to JSON.stringify: Errors reduced to name and message (they print as
    // {} otherwise), every string redacted, depth capped (also ends cycles).
    function plain(value, depth = 0) {
        if (typeof value === 'string') return redact(value);
        if (!value || typeof value !== 'object') return value;
        if (value instanceof Error) return { name: redact(String(value.name)), message: redact(String(value.message)) };
        if (depth >= MAX_DEPTH) return '[truncated]';
        if (Array.isArray(value)) return value.map((item) => plain(item, depth + 1));
        const out = {};
        for (const [key, item] of Object.entries(value)) out[key] = plain(item, depth + 1);
        return out;
    }

    function create(win) {
        const on = isOn(win);
        return {
            on,
            log(step, detail) {
                if (!on) return;
                try {
                    const entry = { step, detail: plain(detail), at: Date.now() };
                    const kept = win.__pushLog || (win.__pushLog = []);
                    kept.push(entry);
                    if (kept.length > MAX_ENTRIES) kept.shift();
                    if (win.console && typeof win.console.info === 'function') win.console.info(`[push] ${step}`, entry.detail);
                } catch (err) {
                    // A logger must never break the flow it observes.
                }
            },
        };
    }

    global.DevotionalPushLog = { create };
})(window);

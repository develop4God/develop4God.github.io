(function (global) {
    'use strict';

    // Opt-in debug trail for the push flow, whose failures are otherwise silent by design (the page
    // must work the same without push). Off unless the page is opened with ?pushdebug=1 or
    // localStorage "devotionalPush.debug" is "1". When on, each step is printed as "[push] step" and kept
    // in window.__pushLog (last 100) so a test or a remote-debugging session can read it. It never
    // throws. It does not filter: callers pass only step names, results and error messages, never
    // tokens or ids. ?pushdebug=0 removes the stored flag (an installed app has no way to edit it).

    const FLAG_KEY = 'devotionalPush.debug';
    const MAX_ENTRIES = 100;

    function isOn(win) {
        try {
            if (/(^|[?&])pushdebug=0(&|$)/.test((win.location && win.location.search) || '')) {
                win.localStorage.removeItem(FLAG_KEY);
                return false;
            }
            if (/(^|[?&])pushdebug=1(&|$)/.test((win.location && win.location.search) || '')) return true;
            return win.localStorage.getItem(FLAG_KEY) === '1';
        } catch (err) {
            return false;
        }
    }

    // An Error would print as {} in JSON; keep what helps.
    function plain(detail) {
        if (!detail || typeof detail !== 'object') return detail;
        const out = {};
        for (const [key, value] of Object.entries(detail)) {
            out[key] = value instanceof Error ? { name: value.name, message: value.message } : value;
        }
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

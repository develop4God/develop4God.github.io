(function (global) {
    'use strict';

    const DEFAULT_RETRIES = 2;
    const DEFAULT_BACKOFF_MS = 500;

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Retries a fetch on network failure or 5xx (transient) responses only —
    // a 4xx means the content genuinely doesn't exist there, so retrying
    // would just repeat a real 404/403, not recover from a blip. Exists as
    // its own module so devotional-loader.js doesn't grow another concern;
    // see .claude/skills/web-coding-agent/SKILL.md Step 4 (SOLID-lite).
    async function fetchWithRetry(url, { retries = DEFAULT_RETRIES, backoffMs = DEFAULT_BACKOFF_MS } = {}) {
        let lastErr;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await fetch(url);
                if (res.ok) return res;
                if (res.status < 500) return res;
                lastErr = new Error(`HTTP ${res.status}`);
            } catch (err) {
                lastErr = err;
            }
            if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
        }
        throw lastErr;
    }

    global.DevotionalFetch = { fetchWithRetry };
})(window);

(function (global) {
    'use strict';

    // Bible-study ("Discovery") index parsing and cached loading. Mirrors the
    // Flutter app's discovery_bloc / discovery_repository behaviour; kept apart
    // from devotional-loader.js on purpose (SOLID-lite, one concern per file).
    const DEFAULT_MINUTES = 5;
    const DEFAULT_EMOJI = '📖';
    const FALLBACK_TITLE_LANG = 'es';
    const INDEX_KEY = 'index';

    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

    function readMinutes(map, lang) {
        if (!isObject(map)) return DEFAULT_MINUTES;
        const n = Number(map[lang]);
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_MINUTES;
    }

    function pick(map, lang) {
        if (!isObject(map)) return '';
        if (isNonEmptyString(map[lang])) return map[lang];
        return isNonEmptyString(map[FALLBACK_TITLE_LANG]) ? map[FALLBACK_TITLE_LANG] : '';
    }

    function parseEntry(raw, lang) {
        if (!isObject(raw) || !isNonEmptyString(raw.id)) return null;
        const file = isObject(raw.files) ? raw.files[lang] : undefined;
        if (!isNonEmptyString(file)) return null; // no fallback language (A1)
        return {
            id: raw.id,
            version: raw.version === undefined || raw.version === null ? '0' : String(raw.version),
            emoji: isNonEmptyString(raw.emoji) ? raw.emoji : DEFAULT_EMOJI,
            title: pick(raw.titles, lang) || raw.id,
            subtitle: isObject(raw.subtitles) && isNonEmptyString(raw.subtitles[lang]) ? raw.subtitles[lang] : '',
            minutes: readMinutes(raw.estimated_reading_minutes, lang),
            file,
        };
    }

    function parseIndex(rawIndex, lang) {
        if (!isObject(rawIndex) || !Array.isArray(rawIndex.studies) || !isNonEmptyString(lang)) return [];
        return rawIndex.studies.map((e) => parseEntry(e, lang)).filter(Boolean);
    }

    // parseIndex (optional): lets another content type (Encounters) reuse this loader with its own index rules.
    // cache: { get(key), put(key, value), remove(key) } (async). Cache failures
    // (quota, blocked storage) are swallowed: caching is an optimisation only.
    function createDiscoveryData({ fetchWithRetry, cache, baseUrl, parseIndex: parse = parseIndex }) {
        const safe = async (fn, fallback = null) => {
            try { return await fn(); } catch (_) { return fallback; }
        };

        async function fetchJson(url) {
            const res = await fetchWithRetry(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        }

        async function loadIndex(lang) {
            try {
                const raw = await fetchJson(`${baseUrl}/index.json`);
                await safe(() => cache.put(INDEX_KEY, raw));
                return parse(raw, lang);
            } catch (err) {
                const cached = await safe(() => cache.get(INDEX_KEY));
                if (cached) return parse(cached, lang);
                throw err;
            }
        }

        async function loadStudy(summary, lang) {
            if (!summary || !isNonEmptyString(summary.file)) throw new Error('Study summary has no file');
            const key = `study:${lang}:${summary.id}`;
            const cached = await safe(() => cache.get(key));
            if (cached && cached.version === summary.version) return cached.data;
            try {
                const data = await fetchJson(`${baseUrl}/${lang}/${summary.file}`);
                await safe(() => cache.put(key, { version: summary.version, data }));
                return data;
            } catch (err) {
                if (cached) return cached.data; // offline: a stale copy beats nothing (A4)
                throw err;
            }
        }

        return { loadIndex, loadStudy };
    }

    global.DiscoveryData = { parseIndex, createDiscoveryData, DEFAULT_MINUTES };
})(window);

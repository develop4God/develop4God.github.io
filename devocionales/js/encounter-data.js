(function (global) {
    'use strict';

    // Encounters index parsing. Loading and caching are the Bible-studies loader
    // (DiscoveryData) with this parser injected, so there is one fetch/cache path.
    // Mirrors EncounterIndexEntry in devocional_nuevo. Load content-index.js and discovery-data.js first.
    const { isObject, isNonEmptyString, readMinutes, pickLocalized, DEFAULT_MINUTES } = global.ContentIndex;
    const DEFAULT_EMOJI = '📖';
    const FALLBACK_LANG = 'en';
    const STATUSES = ['published', 'coming_soon'];
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

    const str = (v) => (isNonEmptyString(v) ? v : '');
    const pick = (map, lang) => pickLocalized(map, lang, FALLBACK_LANG);

    function pickReleaseDate(map, lang) {
        if (!isObject(map)) return '';
        return pick(map, lang) || Object.values(map).find(isNonEmptyString) || '';
    }

    function parseEntry(raw, lang) {
        if (!isObject(raw) || !isNonEmptyString(raw.id) || !STATUSES.includes(raw.status)) return null;
        const isPublished = raw.status === 'published';
        const file = isObject(raw.files) ? str(raw.files[lang]) : '';
        const hasTitle = isObject(raw.titles) && isNonEmptyString(raw.titles[lang]);
        if (isPublished ? !file : !file && !hasTitle) return null;
        return {
            id: raw.id,
            version: raw.version === undefined || raw.version === null ? '0' : String(raw.version),
            status: raw.status,
            isPublished,
            emoji: str(raw.emoji) || DEFAULT_EMOJI,
            accent: isNonEmptyString(raw.accent_color) && HEX_COLOR.test(raw.accent_color) ? raw.accent_color : null,
            mood: str(raw.mood_primary),
            character: str(raw.character),
            introImage: str(raw.intro_image),
            title: pick(raw.titles, lang) || raw.id,
            subtitle: isObject(raw.subtitles) ? str(raw.subtitles[lang]) : '',
            scripture: isObject(raw.scripture_reference) ? str(raw.scripture_reference[lang]) : '',
            minutes: readMinutes(raw.estimated_reading_minutes, lang),
            releaseDate: isPublished ? '' : pickReleaseDate(raw.release_date, lang),
            file,
        };
    }

    function parseIndex(rawIndex, lang) {
        if (!isObject(rawIndex) || !Array.isArray(rawIndex.encounters) || !isNonEmptyString(lang)) return [];
        return rawIndex.encounters.map((e) => parseEntry(e, lang)).filter(Boolean);
    }

    function createEncounterData(deps) {
        return global.DiscoveryData.createDiscoveryData({ ...deps, parseIndex });
    }

    global.EncounterData = { parseIndex, createEncounterData, DEFAULT_MINUTES };
})(window);

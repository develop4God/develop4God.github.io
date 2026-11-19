(function (global) {
    'use strict';

    // Encounter image URLs, mirroring Constants.getEncounterImageUrl in devocional_nuevo:
    // {base}/{encounterId}/{name}.{format}, avif first with png as the fallback. Names come from the
    // remote index, so anything that could leave the encounter's folder yields '' (no image).
    const FORMATS = ['avif', 'png', 'webp'];
    const SAFE_PART = /^[A-Za-z0-9._-]+$/;

    function createImageUrls(baseUrl) {
        const base = String(baseUrl).replace(/\/+$/, '');

        function imageUrl(encounterId, filename, format = 'avif') {
            if (typeof encounterId !== 'string' || typeof filename !== 'string' || !FORMATS.includes(format)) return '';
            const dot = filename.lastIndexOf('.');
            const name = dot > 0 ? filename.slice(0, dot) : filename;
            const safe = (part) => SAFE_PART.test(part) && !/^\.+$/.test(part) && !part.includes('..');
            if (!safe(encounterId) || !safe(name)) return '';
            return `${base}/${encounterId}/${name}.${format}`;
        }

        const cardImageUrl = (card, format) => (card ? imageUrl(card.id, card.introImage, format) : '');

        return { imageUrl, cardImageUrl };
    }

    global.EncounterImages = { createImageUrls };
})(window);

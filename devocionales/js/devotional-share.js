(function (global) {
    'use strict';

    // Mirrors devocional_nuevo's WhatsApp share format (DevotionalShareHelper):
    // emoji section headers + *bold* WhatsApp markdown, verse/reflexión/oración.
    // "Para meditar" is left out here to keep the shared message a reasonable
    // length; mailto: and other targets just render the *asterisks* literally.
    // Labels are passed in (not read from DevotionalI18n directly) so this
    // file stays a pure, dependency-free formatter like bible-text-formatter.js.
    function buildShareText(entry, labels, url) {
        return [
            `📖 *${labels.eyebrow}*`,
            '',
            `✝️ *${labels.versiculo}:*`,
            entry.versiculo,
            '',
            `💭 *${labels.reflexion}:*`,
            entry.reflexion,
            '',
            `🕊️ *${labels.oracion}:*`,
            entry.oracion,
            '',
            `${labels.readMore}: ${url}`,
        ].join('\n');
    }

    global.DevotionalShare = { buildShareText };
})(window);

(function (global) {
    'use strict';

    const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.develop4god.devocional_nuevo&pcampaignid=web_share';

    // Mirrors devocional_nuevo's WhatsApp share format (DevotionalShareHelper):
    // emoji section headers, *bold* WhatsApp markdown, verse/reflexión/oración,
    // then (Android only) a short download footer with the Play Store link.
    // "Para meditar" is left out here to keep the shared message a reasonable
    // length; mailto: and other targets just render the *asterisks* literally.
    // Labels are passed in (not read from DevotionalI18n directly) so this
    // file stays a pure, dependency-free formatter like bible-text-formatter.js.
    // The Play Store footer is only useful on Android; the caller decides via
    // `options.includeAppFooter` (iOS and desktop get the message without it).
    function buildShareText(entry, labels, url, options) {
        const lines = [
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
            `🔗 ${labels.readMore}:`,
            url,
        ];
        if (options && options.includeAppFooter) {
            lines.push(
                '',
                '━━━━━━━━━━━━━━━━',
                `📲 *${labels.footerDownload}*`,
                labels.footerBenefits,
                PLAY_STORE_URL,
                labels.footerDeveloper
            );
        }
        return lines.join('\n');
    }

    global.DevotionalShare = { buildShareText };
})(window);

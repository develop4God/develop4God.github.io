(function (global) {
    'use strict';

    const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.develop4god.devocional_nuevo&pcampaignid=web_share';

    // Mirrors devocional_nuevo's WhatsApp share format (DevotionalShareHelper),
    // including its FOMO footer promoting the app: emoji section headers,
    // *bold* WhatsApp markdown, verse/reflexión/oración, then a feature list
    // and Play Store link to turn shares into new visitors + app installs.
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
            `🔗 ${labels.readMore}:`,
            url,
            '',
            '━━━━━━━━━━━━━━━━',
            `🔥 *${labels.footerTitle}*`,
            '',
            labels.footerCompleteApp,
            `✓ ${labels.footerDailyDevotionals}`,
            `✓ ${labels.footerAudioReading}`,
            `✓ ${labels.footerBibleStudies}`,
            `✓ ${labels.footerBibleVersions}`,
            `✓ ${labels.footerAndMore}`,
            '',
            `📲 *${labels.footerDownload}*`,
            labels.footerBenefits,
            PLAY_STORE_URL,
            labels.footerDeveloper,
        ].join('\n');
    }

    global.DevotionalShare = { buildShareText };
})(window);

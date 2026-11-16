(function (global) {
    'use strict';

    // Port of devocional_nuevo/lib/utils/discovery_share_helper.dart (`_generarResumen`): the
    // summary the app shares for a Bible study. Labels and the store URL are passed in so this
    // stays a pure formatter (same convention as devotional-share.js).
    const SEPARATOR = '━━━━━━━━━━━━━━━━';
    const KEY_POINT_MARKERS = ['•', '1️⃣', '2️⃣', '3️⃣', '💔', '✨', '🌟'];
    const BULLET_LINE = /^[•\-*]\s/;

    function extractKeyPoints(content) {
        const lines = String(content).split('\n').filter((l) => l.trim());
        const points = lines
            .filter((l) => {
                const t = l.trim();
                return KEY_POINT_MARKERS.some((m) => t.includes(m)) || (t.length > 10 && BULLET_LINE.test(t));
            })
            .slice(0, 3);
        return (points.length ? points : lines.slice(0, 2)).join('\n');
    }

    // `order` may be a number or a numeric string; 0 is a real position, anything else falls back to array position.
    function position({ card, index }) {
        const hasOrder = typeof card.order === 'number' || (typeof card.order === 'string' && card.order.trim() !== '');
        return hasOrder && Number.isFinite(Number(card.order)) ? Number(card.order) : index;
    }

    function sortedCards(study) {
        const cards = Array.isArray(study.cards) ? study.cards : [];
        return cards
            .map((card, index) => ({ card, index }))
            .sort((a, b) => position(a) - position(b))
            .map((x) => x.card);
    }

    function buildStudyShareText(study, labels, playStoreUrl) {
        const s = study || {};
        const cards = sortedCards(s);
        const first = cards[0];
        const activation = cards.find((c) => c.type === 'discovery_activation') || cards[cards.length - 1];
        const questions = activation && Array.isArray(activation.discovery_questions) ? activation.discovery_questions : [];
        const firstQuestion = questions.length ? questions[0].question : null;

        const lines = [`${s.emoji || '📖'} *${labels.eyebrow}*`];
        if (s.subtitle) lines.push(`_${s.subtitle}_`);
        lines.push('');

        if (s.key_verse) lines.push(`📖 *${s.key_verse.reference}*`, `"${s.key_verse.text}"`, '');

        if (first) {
            lines.push(`${first.icon || '📝'} *${first.title}*`);
            if (first.content) lines.push(extractKeyPoints(first.content));
            lines.push('');
            if (first.revelation_key) lines.push(`💡 *${labels.revelation}:*`, first.revelation_key, '');
        }

        if (firstQuestion) lines.push(`❓ *${labels.reflectionQuestions}:*`, firstQuestion, '');

        lines.push(SEPARATOR, `📲 *${labels.footerDownload}*`, labels.footerBenefits, playStoreUrl, labels.footerDeveloper);
        return lines.join('\n');
    }

    global.DiscoveryShareText = { buildStudyShareText, extractKeyPoints };
})(window);

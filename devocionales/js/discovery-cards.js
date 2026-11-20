(function (global) {
    'use strict';

    // Pure helpers over a study's `cards`: ordering, the page list (key verse first, like the
    // app's detail page) and the lightweight **bold** / *italic* markup used in card content.
    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

    // `order` may be a number or a numeric string; 0 is a real position, anything else falls back to array position.
    function position(card, index) {
        const hasOrder = typeof card.order === 'number' || (typeof card.order === 'string' && card.order.trim() !== '');
        return hasOrder && Number.isFinite(Number(card.order)) ? Number(card.order) : index;
    }

    function sortCards(cards) {
        if (!Array.isArray(cards)) return [];
        return cards
            .filter(isObject)
            .map((card, index) => ({ card, index }))
            .sort((a, b) => position(a.card, a.index) - position(b.card, b.index))
            .map((x) => x.card);
    }

    // Pages of the detail view: an optional key-verse page, then one page per card.
    function buildPages(study) {
        if (!isObject(study)) return [];
        const cards = sortCards(study.cards);
        if (!cards.length) return [];
        const pages = [];
        if (isObject(study.key_verse)) pages.push({ kind: 'keyVerse', keyVerse: study.key_verse, sectionIndex: null, isLast: false });
        cards.forEach((card, i) => pages.push({ kind: 'card', card, sectionIndex: i, isLast: i === cards.length - 1 }));
        return pages;
    }

    // Port of the app's buildEmphasisMarkdownText: bold is matched before italic.
    function parseEmphasis(text) {
        if (typeof text !== 'string' || !text) return [];
        const segments = [];
        const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g;
        let last = 0;
        for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
            if (m.index > last) segments.push({ text: text.slice(last, m.index) });
            segments.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], italic: true });
            last = m.index + m[0].length;
        }
        if (last < text.length) segments.push({ text: text.slice(last) });
        return segments;
    }

    // Section progress, shared by Bible studies and Encounters. Only card pages are sections; the key-verse
    // page is not counted and never recorded.
    const countSections = (pages) => (Array.isArray(pages) ? pages.filter((p) => p && p.sectionIndex !== null).length : 0);

    // Index of the first card page not yet read. Falls back to page 0 when nothing is read yet or every section is read.
    function firstUnreadIndex(pages, completedSections) {
        if (!Array.isArray(pages) || !pages.length) return 0;
        const done = new Set(completedSections || []);
        if (!done.size) return 0;
        const next = pages.findIndex((p) => p.sectionIndex !== null && !done.has(p.sectionIndex));
        return next === -1 ? 0 : next;
    }

    // 0..1 for the progress bar, or null when there is no total to measure against. Completed is always full.
    function progressFraction({ isCompleted, sections, total }) {
        if (isCompleted) return 1;
        if (!(total > 0)) return null;
        return Math.min(1, sections / total);
    }

    global.DiscoveryCards = { sortCards, buildPages, parseEmphasis, countSections, firstUnreadIndex, progressFraction };
})(window);

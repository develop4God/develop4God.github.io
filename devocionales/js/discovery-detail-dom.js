(function (global) {
    'use strict';

    // DOM for the Bible-study reader: one page per card (plus a key-verse page), the segmented
    // progress bar, paging buttons, the completion footer and the not-found state. Field coverage
    // follows the writer's schema (devocionales-json discovery_schema_checks.py), so unknown card
    // types still render every common field. All strings are set with textContent (E0).
    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const isText = (v) => typeof v === 'string' && v.length > 0;
    const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);

    function createDetailDom({ h, t }) {
        function emphasis(text) {
            return global.DiscoveryCards.parseEmphasis(text).map((seg) => {
                if (seg.bold) return h('strong', { text: seg.text });
                if (seg.italic) return h('em', { text: seg.text });
                return h('span', { text: seg.text });
            });
        }

        const labeled = (label, value) => (isText(value) ? h('p', { class: 'study-word-line', text: `${label}: ${value}` }) : null);

        function verse(v) {
            return h('div', { class: 'study-verse' }, [
                h('p', { class: 'study-verse-ref', text: v.reference }),
                isText(v.text) ? h('p', { class: 'study-verse-text', text: v.text }) : null,
            ]);
        }

        function word(w) {
            return h('div', { class: 'study-word' }, [
                h('p', {}, [
                    h('span', { class: 'study-word-term', text: w.word }),
                    isText(w.transliteration) ? h('span', { class: 'study-word-translit', text: ` (${w.transliteration})` }) : null,
                    isText(w.strong) ? h('span', { class: 'study-word-strong', text: ` ${w.strong}` }) : null,
                ]),
                labeled(t('meaning'), w.meaning),
                labeled(t('revelation'), w.revelation),
                labeled(t('reference'), w.reference),
                labeled(t('application'), w.application),
            ]);
        }

        function question(q) {
            return h('div', { class: 'study-question' }, [
                isText(q.category) ? h('p', { class: 'study-question-category', text: q.category.toUpperCase() }) : null,
                isText(q.question) ? h('p', { class: 'study-question-text', text: q.question }) : null,
            ]);
        }

        function cardSections(card) {
            const words = [...list(card.greek_words), ...list(card.hebrew_words)].filter((w) => isText(w.word));
            const verses = [...list(card.scripture_connections), ...list(card.scripture_references)].filter((v) => isText(v.reference));
            const questions = list(card.discovery_questions).length ? list(card.discovery_questions) : list(card.reflection_questions);
            const anchor = isObject(card.scripture_anchor) && isText(card.scripture_anchor.reference) ? card.scripture_anchor : null;
            const prayer = isObject(card.prayer) ? card.prayer : null;
            return [
                isText(card.icon) ? h('p', { class: 'study-page-icon', text: card.icon, attrs: { 'aria-hidden': 'true' } }) : null,
                h('h2', { class: 'study-page-title', text: String(card.title || '') }),
                isText(card.subtitle) ? h('p', { class: 'study-page-subtitle', text: card.subtitle }) : null,
                isText(card.content) ? h('p', { class: 'study-page-content' }, emphasis(card.content)) : null,
                isText(card.revelation_key) ? h('div', { class: 'study-revelation' }, [
                    h('p', { class: 'study-revelation-label', text: t('revelation') }),
                    h('p', { text: card.revelation_key }),
                ]) : null,
                anchor ? h('div', { class: 'study-anchor' }, [
                    h('p', { class: 'study-anchor-ref', text: anchor.reference }),
                    isText(anchor.text) ? h('p', { class: 'study-anchor-text', text: anchor.text }) : null,
                ]) : null,
                isText(card.identity_statement) ? h('p', { class: 'study-identity', text: card.identity_statement }) : null,
                ...verses.map(verse),
                ...words.map(word),
                ...list(card.action_steps).map((s) => h('div', { class: 'study-step' }, [
                    isText(s.title) ? h('p', { class: 'study-step-title', text: s.title }) : null,
                    isText(s.description) ? h('p', { text: s.description }) : null,
                ])),
                ...list(card.timeline).map((e) => h('div', { class: 'study-timeline-item' }, [
                    isText(e.event) ? h('p', { class: 'study-timeline-event', text: e.event }) : null,
                    isText(e.description) ? h('p', { text: e.description }) : null,
                    isText(e.revelation) ? h('p', { class: 'study-timeline-revelation', text: e.revelation }) : null,
                ])),
                questions.length ? h('p', { class: 'study-questions-title', text: t('reflectionQuestions') }) : null,
                ...questions.map(question),
                prayer && (isText(prayer.title) || isText(prayer.content)) ? h('div', { class: 'study-prayer' }, [
                    h('p', { class: 'study-prayer-title', text: t('activationPrayer') }),
                    isText(prayer.title) ? h('p', { class: 'study-prayer-heading', text: prayer.title }) : null,
                    isText(prayer.content) ? h('p', { class: 'study-prayer-text', text: prayer.content }) : null,
                ]) : null,
            ];
        }

        function buildPage(page) {
            if (page.kind === 'keyVerse') {
                return h('section', { class: 'study-page study-page-keyverse' }, [
                    h('p', { class: 'study-keyverse-label', text: t('keyVerse') }),
                    h('p', { class: 'study-keyverse-text', text: String(page.keyVerse.text || '') }),
                    h('p', { class: 'study-keyverse-ref', text: String(page.keyVerse.reference || '') }),
                ]);
            }
            return h('section', { class: 'study-page' }, cardSections(page.card));
        }

        function buildProgress(total, index, label) {
            const segments = Array.from({ length: total }, (_, i) => h('span', { class: `study-seg${i <= index ? ' is-done' : ''}` }));
            return h('div', {
                class: 'study-segments',
                attrs: { role: 'progressbar', 'aria-label': label, 'aria-valuemin': '1', 'aria-valuemax': String(total), 'aria-valuenow': String(index + 1) },
            }, segments);
        }

        function buildNav({ index, total, onPrev, onNext, onExit }) {
            const isLast = index >= total - 1;
            return h('div', { class: 'study-nav' }, [
                h('button', { class: 'study-prev', text: t('previous'), attrs: { type: 'button', disabled: index === 0 ? '' : undefined }, on: { click: onPrev } }),
                isLast
                    ? h('button', { class: 'study-exit', text: t('exit'), attrs: { type: 'button' }, on: { click: onExit } })
                    : h('button', { class: 'study-next', text: t('next'), attrs: { type: 'button' }, on: { click: onNext } }),
            ]);
        }

        function buildFooter({ isCompleted, copyright, onComplete }) {
            return h('div', { class: 'study-footer' }, [
                h('button', {
                    class: 'study-complete',
                    text: t(isCompleted ? 'completedStudy' : 'markCompleted'),
                    attrs: { type: 'button', disabled: isCompleted ? '' : undefined },
                    on: { click: onComplete },
                }),
                isText(copyright) ? h('p', { class: 'study-copyright', text: copyright }) : null,
            ]);
        }

        function buildHeader({ emoji, title, subtitle }) {
            return h('header', { class: 'study-detail-header' }, [
                isText(emoji) ? h('span', { class: 'study-card-emoji', text: emoji, attrs: { 'aria-hidden': 'true' } }) : null,
                h('div', {}, [
                    h('h1', { class: 'study-detail-title', text: title }),
                    isText(subtitle) ? h('p', { class: 'study-detail-subtitle', text: subtitle }) : null,
                ]),
            ]);
        }

        function buildNotFound({ onBack }) {
            return h('div', { class: 'study-message', attrs: { role: 'alert' } }, [
                h('p', { text: t('studyNotFound') }),
                h('button', { class: 'study-back', text: t('title'), attrs: { type: 'button' }, on: { click: onBack } }),
            ]);
        }

        return { buildPage, buildProgress, buildNav, buildFooter, buildHeader, buildNotFound };
    }

    global.DiscoveryDetailDom = { createDetailDom };
})(window);

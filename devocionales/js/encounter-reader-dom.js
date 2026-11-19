(function (global) {
    'use strict';

    // DOM for the Encounters reader: the intro screen (C0), one page per card and the key verse
    // (C3), the segmented progress bar, paging buttons, the completion footer and the not-found /
    // error states. Layout follows the app's card widgets; field coverage follows
    // encounter_card_contract.dart (rendered fields per card type). Every remote string is set with
    // textContent through the builder, so nothing from the content can become markup.
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
    const isText = (v) => typeof v === 'string' && v.length > 0;
    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);

    function createReaderDom({ h, t, imageUrlFor, pagerDots = global.UiPagerDots.createPagerDots({ h }) }) {
        const emphasis = (value) => global.DiscoveryCards.parseEmphasis(value).map((seg) => {
            if (seg.bold) return h('strong', { text: seg.text });
            if (seg.italic) return h('em', { text: seg.text });
            return h('span', { text: seg.text });
        });

        // Paragraphs split on blank lines, like the app's narrative text.
        const paragraphs = (value, className) => (isText(value)
            ? value.split(/\n\s*\n/).filter((p) => p.trim()).map((p) => h('p', { class: className }, emphasis(p.trim())))
            : []);

        // A missing image never blocks reading: it hides itself on error (C4).
        function image(encounterId, file) {
            if (!isText(file)) return null;
            return h('img', {
                class: 'encounter-card-image',
                attrs: { src: imageUrlFor(encounterId, file), alt: '', loading: 'lazy', decoding: 'async' },
                on: { error: (e) => { e.target.hidden = true; } },
            });
        }

        function verse(v, className = 'encounter-verse') {
            if (!isObject(v) || !isText(v.reference)) return null;
            return h('div', { class: className }, [
                h('p', { class: `${className}-ref`, text: v.reference }),
                isText(v.text) ? h('p', { class: `${className}-text`, text: v.text }) : null,
            ]);
        }

        const titleOf = (card) => (isText(card.title) ? h('h2', { class: 'encounter-page-title', text: card.title }) : null);
        const subtitleOf = (card) => (isText(card.subtitle) ? h('p', { class: 'encounter-page-subtitle', text: card.subtitle }) : null);
        const iconOf = (card) => (isText(card.icon) ? h('p', { class: 'encounter-page-icon', text: card.icon, attrs: { 'aria-hidden': 'true' } }) : null);
        const revelation = (card) => (isText(card.revelation_key) ? h('p', { class: 'encounter-revelation', text: card.revelation_key }) : null);

        function questions(items) {
            return list(items).map((q) => h('div', { class: 'encounter-question' }, [
                isText(q.category) ? h('p', { class: 'encounter-question-category', text: q.category.toUpperCase() }) : null,
                isText(q.question) ? h('p', { class: 'encounter-question-text', text: q.question }) : null,
            ]));
        }

        const connections = (card) => list(card.scripture_connections).map((v) => verse(v));

        function prayer(p) {
            if (!isObject(p) || !(isText(p.title) || isText(p.content))) return null;
            // Title is uppercased and falls back to the prayer label, as in the app's prayer block.
            return h('div', { class: 'encounter-prayer' }, [
                h('p', { class: 'encounter-prayer-title', text: (isText(p.title) ? p.title : t('prayer_label')).toUpperCase() }),
                ...paragraphs(p.content, 'encounter-prayer-text'),
            ]);
        }

        // Each renderer returns the children of one card; the page section wraps them.
        const RENDERERS = {
            cinematic_scene: (card, id) => [
                image(id, card.image_url), titleOf(card), ...paragraphs(card.narrative, 'encounter-narrative'),
                verse(card.verse_overlay), ...connections(card), revelation(card),
            ],
            scripture_moment: (card, id) => [
                image(id, card.image_url), titleOf(card), subtitleOf(card), verse({ reference: card.verse_reference, text: card.verse_text }),
                ...paragraphs(card.reflection, 'encounter-reflection'), ...connections(card), revelation(card),
            ],
            character_moment: (card, id) => [
                image(id, card.image_url), iconOf(card), titleOf(card), subtitleOf(card), ...paragraphs(card.content, 'encounter-content'),
                verse(card.verse_overlay), ...connections(card), revelation(card),
            ],
            theological_depth: (card, id) => RENDERERS.character_moment(card, id),
            discovery_activation: (card, id) => [
                image(id, card.image_url), titleOf(card), subtitleOf(card), ...questions(card.discovery_questions), prayer(card.prayer),
            ],
            completion: (card, id) => [
                image(id, card.image_url), verse(card.completion_verse, 'encounter-completion-verse'),
                ...paragraphs(card.reflection_prompt, 'encounter-reflection'),
            ],
            interactive_moment: (card, id) => [
                image(id, card.image_url), iconOf(card), titleOf(card), subtitleOf(card),
                ...paragraphs(card.reflection_prompt, 'encounter-reflection'), revelation(card),
            ],
        };

        // Unknown card types still show their common text fields, never a blank page.
        const fallback = (card, id) => [
            image(id, card.image_url), titleOf(card), subtitleOf(card), ...paragraphs(card.narrative, 'encounter-narrative'),
            ...paragraphs(card.content, 'encounter-content'), ...paragraphs(card.reflection, 'encounter-reflection'), revelation(card),
        ];

        function buildPage(page, encounterId) {
            if (page.kind === 'keyVerse') {
                return h('section', { class: 'encounter-page encounter-page--keyverse' }, [
                    h('p', { class: 'encounter-keyverse-label', text: t('key_verse') }),
                    h('p', { class: 'encounter-keyverse-text', text: String(page.keyVerse.text || '') }),
                    h('p', { class: 'encounter-keyverse-ref', text: String(page.keyVerse.reference || '') }),
                ]);
            }
            const card = page.card;
            const render = RENDERERS[card.type] || fallback;
            return h('section', { class: `encounter-page encounter-page--${card.type || 'unknown'}` }, render(card, encounterId));
        }

        function buildIntro(entry, { onEnter, onBack }) {
            const accent = isText(entry.accent) && HEX_COLOR.test(entry.accent) ? `background-color:${entry.accent}` : undefined;
            const minutesLine = `${entry.minutes} ${t('min_immersive_journey')}`;
            const testament = entry.testament === 'old' ? t('old_testament') : (entry.testament === 'new' ? t('new_testament') : '');
            return h('section', { class: 'encounter-intro' }, [
                h('button', { class: 'encounter-intro-back', text: '←', attrs: { type: 'button', 'aria-label': t('exit') }, on: { click: onBack } }),
                h('div', { class: 'encounter-intro-media', attrs: { style: accent } }, [
                    h('span', { class: 'encounter-intro-emoji', text: entry.emoji, attrs: { 'aria-hidden': 'true' } }),
                    image(entry.id, entry.introImage),
                ]),
                h('h1', { class: 'encounter-intro-title', text: entry.title }),
                isText(entry.subtitle) ? h('p', { class: 'encounter-intro-subtitle', text: entry.subtitle }) : null,
                isText(entry.scripture) ? h('p', { class: 'encounter-intro-scripture', text: entry.scripture }) : null,
                h('div', { class: 'encounter-intro-chips' }, [
                    h('span', { class: 'encounter-chip', text: minutesLine }),
                    testament ? h('span', { class: 'encounter-chip', text: testament }) : null,
                ]),
                h('button', { class: 'encounter-intro-enter', text: t('enter_experience'), attrs: { type: 'button' }, on: { click: onEnter } }),
            ]);
        }

        function buildProgress(total, index, label, { onSelect } = {}) {
            return pagerDots.build({ total, index, label, pageLabel: (n, count) => `${n} / ${count}`, onSelect });
        }

        function buildNav({ index, total, onPrev, onNext, onExit }) {
            const isLast = index >= total - 1;
            return h('div', { class: 'encounter-nav' }, [
                h('button', { class: 'encounter-prev', text: '‹', attrs: { type: 'button', disabled: index === 0 ? '' : undefined }, on: { click: onPrev } }),
                isLast
                    ? h('button', { class: 'encounter-exit', text: t('exit'), attrs: { type: 'button' }, on: { click: onExit } })
                    : h('button', { class: 'encounter-next', text: '›', attrs: { type: 'button' }, on: { click: onNext } }),
            ]);
        }

        function buildFooter({ isCompleted, copyright, onComplete }) {
            return h('div', { class: 'encounter-footer' }, [
                h('button', {
                    class: 'encounter-complete',
                    text: t(isCompleted ? 'badge_completed' : 'encounter_complete'),
                    attrs: { type: 'button', disabled: isCompleted ? '' : undefined },
                    on: { click: onComplete },
                }),
                isText(copyright) ? h('p', { class: 'encounter-copyright', text: copyright }) : null,
            ]);
        }

        function buildNotFound({ onBack }) {
            return h('div', { class: 'encounter-message', attrs: { role: 'alert' } }, [
                h('p', { text: t('study_not_found') }),
                h('button', { class: 'encounter-back', text: t('section_title'), attrs: { type: 'button' }, on: { click: onBack } }),
            ]);
        }

        function buildError({ onRetry }) {
            return h('div', { class: 'encounter-message', attrs: { role: 'alert' } }, [
                h('p', { text: t('error_load') }),
                h('button', { class: 'encounter-retry', text: t('retry'), attrs: { type: 'button' }, on: { click: onRetry } }),
            ]);
        }

        return { buildPage, buildIntro, buildProgress, buildNav, buildFooter, buildNotFound, buildError };
    }

    global.EncounterReaderDom = { createReaderDom };
})(window);

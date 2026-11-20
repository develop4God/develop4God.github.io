(function (global) {
    'use strict';

    // Markup shared by the Bible-studies and Encounters list headers: the progress bar, the "Start here" /
    // "Continue" hero and the filter chips. Pure view code: copy comes in already translated, taps go out
    // through callbacks, and every remote string is set with textContent via the injected builder.
    function createHeroDom({ h }) {
        // ARIA progressbar used by the cards and the hero.
        function progressBar(percent, className) {
            return h('div', {
                class: className,
                attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) },
            }, [h('span', { class: 'study-progress-fill', attrs: { style: `width:${percent}%` } })]);
        }

        // props: { label, buttonLabel, card, percent } (see DiscoveryProgress.heroProps); a percent adds the bar.
        function buildHero({ label, buttonLabel, card, percent = null }, { onOpen }) {
            return h('section', { class: 'study-hero' }, [
                h('p', { class: 'study-hero-label', text: label }),
                h('div', { class: 'study-hero-main' }, [
                    h('span', { class: 'study-card-emoji', text: card.emoji, attrs: { 'aria-hidden': 'true' } }),
                    h('div', { class: 'study-hero-text' }, [
                        h('h2', { class: 'study-hero-title', text: card.title }),
                        card.subtitle ? h('p', { class: 'study-card-subtitle', text: card.subtitle }) : null,
                    ]),
                ]),
                percent === null ? null : h('div', { class: 'study-hero-progress' }, [
                    progressBar(percent, 'study-hero-bar'),
                    h('span', { class: 'study-hero-percent', text: `${percent}%` }),
                ]),
                h('button', { class: 'study-hero-button', text: buttonLabel, attrs: { type: 'button' }, on: { click: () => onOpen(card.id) } }),
            ]);
        }

        // items: [{ filter, label, count }]; the active one is pressed, a click reports its filter.
        function buildFilterChips(items, active, onSelect, groupLabel) {
            return h('div', { class: 'study-chips', attrs: { role: 'group', 'aria-label': groupLabel } }, items.map(({ filter, label, count }) => h('button', {
                class: 'study-chip',
                attrs: { type: 'button', 'data-filter': filter, 'aria-pressed': String(filter === active) },
                on: { click: () => onSelect(filter) },
            }, [
                h('span', { class: 'study-chip-label', text: label }),
                h('span', { class: 'study-chip-count', text: String(count) }),
            ])));
        }

        return { progressBar, buildHero, buildFilterChips };
    }

    global.DiscoveryHeroDom = { createHeroDom };
})(window);

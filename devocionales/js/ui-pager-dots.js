(function (global) {
    'use strict';

    // Content-agnostic pager dots: one tappable button per page, the current one marked with
    // aria-current. Labels come from the caller (pageLabel), so this module holds no strings and
    // can page any content. Styling lives in the page CSS (.pager-dot, .is-done, .is-current).
    function createPagerDots({ h }) {
        function build({ total, index, label, pageLabel, onSelect }) {
            const dots = Array.from({ length: total }, (_, i) => h('button', {
                class: `pager-dot${i <= index ? ' is-done' : ''}${i === index ? ' is-current' : ''}`,
                attrs: { type: 'button', 'aria-label': pageLabel(i + 1, total), 'aria-current': i === index ? 'step' : undefined },
                on: { click: () => { if (onSelect) onSelect(i); } },
            }));
            return h('div', { class: 'pager-dots', attrs: { role: 'group', 'aria-label': label } }, dots);
        }

        return { build };
    }

    global.UiPagerDots = { createPagerDots };
})(window);

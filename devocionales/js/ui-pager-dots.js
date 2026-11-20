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


    // The paging controls shared by the Bible-studies and Encounters readers: the progress dots and
    // the previous / next / exit row. Labels are injected, so each reader supplies its own strings
    // and this module holds no copy of any reader's text. Styling lives in discovery.css.
    function createPagingDom({ h, labels, pageLabel = (n, count) => `${n} / ${count}`, pagerDots = global.UiPagerDots.createPagerDots({ h }) }) {
        function buildProgress(total, index, label, { onSelect } = {}) {
            return pagerDots.build({
                total,
                index,
                label,
                pageLabel,
                onSelect,
            });
        }

        function buildNav({ index, total, onPrev, onNext, onExit }) {
            const isLast = index >= total - 1;
            return h('div', { class: 'reader-nav' }, [
                h('button', {
                    class: 'reader-prev',
                    text: labels.previous,
                    attrs: { type: 'button', disabled: index === 0 ? '' : undefined },
                    on: { click: onPrev },
                }),
                isLast
                    ? h('button', { class: 'reader-exit', text: labels.exit, attrs: { type: 'button' }, on: { click: onExit } })
                    : h('button', { class: 'reader-next', text: labels.next, attrs: { type: 'button' }, on: { click: onNext } }),
            ]);
        }

        return { buildProgress, buildNav };
    }

    global.UiPagerDots = { createPagerDots };
    global.ReaderPagingDom = { createPagingDom };
})(window);

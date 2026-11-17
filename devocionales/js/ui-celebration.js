(function (global) {
    'use strict';

    // Confetti burst for finishing a Bible study. Purely decorative: aria-hidden, no pointer events,
    // removed after the animation. Each piece's drift, colour and delay come from the page CSS
    // (.confetti-piece:nth-child), so the DOM carries no inline styles and the burst is deterministic.
    // Skipped entirely when the viewer prefers reduced motion. Timers are injected for tests.
    const DEFAULT_PIECES = 28;

    function createCelebration({ h, container, reducedMotion, durationMs = 2200, pieces = DEFAULT_PIECES, setTimer = setTimeout, clearTimer = clearTimeout }) {
        const count = Number.isInteger(pieces) && pieces > 0 ? pieces : DEFAULT_PIECES;
        let layer = null;
        let timerId = null;

        function clear() {
            if (timerId !== null) clearTimer(timerId);
            timerId = null;
            if (layer) layer.remove();
            layer = null;
        }

        function burst() {
            if (reducedMotion()) return false;
            clear();
            const mine = h('div', { class: 'celebration', attrs: { 'aria-hidden': 'true' } },
                Array.from({ length: count }, () => h('span', { class: 'confetti-piece' })));
            layer = mine;
            container.append(mine);
            timerId = setTimer(() => { if (layer === mine) clear(); }, durationMs);
            return true;
        }

        return { burst };
    }

    global.UiCelebration = { createCelebration };
})(window);

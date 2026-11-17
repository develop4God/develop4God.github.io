(function (global) {
    'use strict';

    // Content-agnostic finger-follow paging: the target element tracks a horizontal drag, springs back
    // when the swipe is too short or mostly vertical, and hands a committed swipe to onCommit.
    // Vertical movement is never claimed, so scrolling stays free. Where there is no page to go to,
    // the drag is rubber-banded. Everything content-specific is injected:
    //   getTarget()  the element to move (or null)        classify({dx, dy}) -> 'next' | 'prev' | null
    //   canGo(dir)   whether that page exists             rtl()  whether 'next' is to the right
    const CLAIM_PX = 10;
    const FOLLOW = 0.6; // the page moves slower than the finger, so it feels weighted
    const RESIST = 0.2;
    const RESIST_MAX_PX = 28;

    function createSwipeDrag({ classify, getTarget, rtl, canGo, onCommit }) {
        let origin = null;
        let claimed = false;
        let vertical = false;

        function place(px) {
            const el = getTarget();
            if (!el) return;
            el.style.transition = px === null ? '' : 'none'; // follow the finger without easing, ease only on release
            el.style.transform = px === null ? '' : `translateX(${px}px)`;
        }

        const directionOf = (dx) => ((dx < 0) !== rtl() ? 'next' : 'prev');

        function start(x, y) {
            origin = { x, y };
            claimed = false;
            vertical = false;
        }

        function move(x, y) {
            if (!origin || vertical) return;
            const dx = x - origin.x;
            const dy = y - origin.y;
            if (!claimed) {
                if (Math.abs(dy) > CLAIM_PX && Math.abs(dy) * 1.5 > Math.abs(dx)) { vertical = true; return; }
                if (Math.abs(dx) < CLAIM_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
                claimed = true;
            }
            if (canGo(directionOf(dx))) place(Math.round(dx * FOLLOW));
            else place(Math.sign(dx) * Math.min(Math.abs(dx) * RESIST, RESIST_MAX_PX));
        }

        function release() {
            place(null);
            origin = null;
            claimed = false;
            vertical = false;
        }

        function end(x, y) {
            if (!origin) return;
            const action = classify({ dx: x - origin.x, dy: y - origin.y });
            release();
            if (action && canGo(action)) onCommit(action);
        }

        return { start, move, end, cancel: release };
    }

    global.UiSwipeDrag = { createSwipeDrag };
})(window);

(function (global) {
    'use strict';

    // Pure navigation helpers for the Bible-studies page: which study the URL points at,
    // how to build that URL, and how a touch swipe or an arrow key maps to paging.
    const MIN_SWIPE_PX = 50;
    const HORIZONTAL_DOMINANCE = 1.5; // |dx| must clearly beat |dy| so vertical scrolling is never a swipe

    function parseRoute(search) {
        const id = new URLSearchParams(typeof search === 'string' ? search : '').get('id');
        return { studyId: id || null };
    }

    function buildStudyUrl(pathname, search, studyId) {
        const params = new URLSearchParams(typeof search === 'string' ? search : '');
        if (studyId) params.set('id', studyId); else params.delete('id');
        const query = params.toString();
        return query ? `${pathname}?${query}` : pathname;
    }

    function classifySwipe(delta, { rtl = false } = {}) {
        if (!delta || !Number.isFinite(delta.dx) || !Number.isFinite(delta.dy)) return null;
        if (Math.abs(delta.dx) < MIN_SWIPE_PX || Math.abs(delta.dx) < Math.abs(delta.dy) * HORIZONTAL_DOMINANCE) return null;
        const towardsNext = delta.dx < 0; // finger moves left = next page in LTR
        return towardsNext !== rtl ? 'next' : 'prev';
    }

    function keyAction(key, { rtl = false } = {}) {
        if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
        return (key === 'ArrowRight') !== rtl ? 'next' : 'prev';
    }

    // Arrow keys belong to the control when the user is typing or driving a form widget.
    function isTypingTarget(el) {
        if (!el) return false;
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable) return true;
        const role = el.getAttribute ? el.getAttribute('role') : null;
        return ['slider', 'spinbutton', 'listbox', 'combobox', 'radiogroup', 'tablist'].includes(role);
    }

    global.DiscoveryNav = { parseRoute, buildStudyUrl, classifySwipe, keyAction, isTypingTarget };
})(window);

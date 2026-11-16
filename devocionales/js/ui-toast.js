(function (global) {
    'use strict';

    // Single-message toast in a polite live region (announced by screen readers, never steals focus).
    // Styling lives in the page CSS (.toast, .is-visible, .toast-error). Timers are injected for tests.
    function createToast({ document: doc, container, durationMs = 3000, setTimer = setTimeout, clearTimer = clearTimeout }) {
        let region = null;
        let timerId = null;

        function ensureRegion() {
            if (region) return region;
            region = doc.createElement('div');
            region.className = 'toast';
            region.setAttribute('role', 'status');
            region.setAttribute('aria-live', 'polite');
            container.append(region);
            return region;
        }

        function show(message, { kind } = {}) {
            if (typeof message !== 'string' || !message) return;
            const el = ensureRegion();
            if (timerId !== null) clearTimer(timerId);
            el.textContent = message;
            el.classList.toggle('toast-error', kind === 'error');
            el.classList.add('is-visible');
            timerId = setTimer(() => el.classList.remove('is-visible'), durationMs);
        }

        return { show };
    }

    global.UiToast = { createToast };
})(window);

(function (global) {
    'use strict';

    // The thank-you pass shown once a PayPal payment unlocks every encounter: a modal dialog with a
    // "Start reading" button. Built with the injected DOM builder only (text is never parsed as HTML).
    // It makes the page inert while open, closes on the button or Escape, and returns focus to the
    // page title. It closes itself after autoCloseMs; a manual close cancels that timer. Closing twice
    // does nothing, so a late timer can never fire on a pass that was already dismissed.
    const KEYS = { kicker: 'pass_kicker', title: 'pass_title', body: 'pass_body', button: 'pass_button' };

    function createPassDom({ h, t, container, setBackgroundInert, focusFallback, setTimer, clearTimer, autoCloseMs }) {
        let current = null; // { element, timer }

        function close() {
            if (!current) return;
            const { element, timer } = current;
            current = null;
            clearTimer(timer);
            element.remove();
            setBackgroundInert(false);
            focusFallback();
        }

        function open() {
            if (current) return;
            const button = h('button', {
                class: 'encounter-pass-button',
                text: t(KEYS.button),
                attrs: { type: 'button' },
                on: { click: close },
            });
            const element = h('div', {
                class: 'encounter-pass',
                attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'encounter-pass-title' },
                on: { keydown: (e) => { if (e.key === 'Escape') close(); } },
            }, [
                h('div', { class: 'encounter-pass-card' }, [
                    h('p', { class: 'encounter-pass-kicker', text: t(KEYS.kicker) }),
                    h('h2', { class: 'encounter-pass-title', attrs: { id: 'encounter-pass-title' }, text: t(KEYS.title) }),
                    h('p', { class: 'encounter-pass-body', text: t(KEYS.body) }),
                    button,
                ]),
            ]);
            const timer = setTimer(close, autoCloseMs);
            current = { element, timer };
            container.append(element);
            setBackgroundInert(true);
            button.focus();
        }

        return { open, close, isOpen: () => current !== null };
    }

    global.EncounterPassDom = { createPassDom };
})(window);

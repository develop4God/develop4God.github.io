(function (global) {
    'use strict';

    // The "read at your own pace" sheet shown when a locked encounter is tapped (EncounterUnlockOfferSheet
    // in the app). Modal dialog: focus starts on the safe choice (Keep reading), Escape / backdrop /
    // Keep reading close it and focus returns to what opened it. `mountActions` lets the payment
    // module add its button without this file knowing about payments. `showPlayLink` is false where
    // there is no app to open (iOS).
    const TITLE_ID = 'encounter-sheet-title';

    function createUnlockSheet({ h, t, container, playStoreUrl, showPlayLink = true, setBackgroundInert = () => {} }) {
        let backdrop = null;
        let trigger = null;

        function close() {
            if (!backdrop) return;
            backdrop.remove();
            backdrop = null;
            setBackgroundInert(false);
            if (trigger && trigger.focus) trigger.focus();
            trigger = null;
        }

        function open({ mountActions } = {}) {
            if (backdrop) return;
            trigger = container.ownerDocument.activeElement;
            const keep = h('button', { class: 'encounter-sheet-keep', text: t('unlock_offer_keep_reading'), attrs: { type: 'button' }, on: { click: close } });
            const actions = h('div', { class: 'encounter-sheet-actions' }, [
                showPlayLink && playStoreUrl ? h('a', { class: 'encounter-sheet-play', text: t('unlock_offer_play'), attrs: { href: playStoreUrl, rel: 'noopener', target: '_blank' } }) : null,
                keep,
            ]);
            if (mountActions) mountActions(actions);
            const dialog = h('div', {
                class: 'encounter-sheet',
                attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': TITLE_ID },
                on: { keydown: (e) => { if (e.key === 'Escape') close(); } },
            }, [
                h('h2', { class: 'encounter-sheet-title', text: t('unlock_offer_title'), attrs: { id: TITLE_ID } }),
                ...t('unlock_offer_body').split(/\n{2,}/).filter(Boolean).map((p) => h('p', { class: 'encounter-sheet-body', text: p })),
                actions,
            ]);
            backdrop = h('div', { class: 'encounter-sheet-backdrop', on: { click: (e) => { if (e.target === backdrop) close(); } } }, [dialog]);
            container.append(backdrop);
            setBackgroundInert(true);
            keep.focus();
        }

        return { open, close };
    }

    global.EncounterUnlockSheetDom = { createUnlockSheet };
})(window);

(function (global) {
    'use strict';

    // The first-launch card on Home that offers to turn notifications on. It owns only the card:
    // when it shows, and what "Not now" remembers (Enable remembers nothing: the browser's answer does). Whether the reader is eligible and what Enable
    // does are injected, so Enable runs the same flow as the Settings switch. Every element is
    // optional: a page cached from before the card existed simply has nothing to show.

    const KEY_DISMISSED = 'devotionalPush.offerDismissed';

    // `storage` is the guarded storage of the facade (never throws); `isEligible` says whether the
    // reader could still be offered notifications; `onEnable` starts the enable flow.
    function create(doc, { storage, isEligible, onEnable }) {
        const card = doc.querySelector('[data-push-offer]');
        const enableButton = doc.querySelector('[data-push-offer-enable]');
        const laterButton = doc.querySelector('[data-push-offer-later]');
        // Set once the reader chose "Not now", so even unusable storage cannot bring it back on this page.
        let answered = false;

        const setShown = (shown) => {
            if (card) card.classList[shown ? 'remove' : 'add']('hidden');
        };

        const eligible = () => {
            try {
                return Boolean(isEligible());
            } catch (err) {
                return false;
            }
        };

        const update = () => setShown(!answered && storage.get(KEY_DISMISSED) !== '1' && eligible());

        if (enableButton) {
            // Hidden while the flow runs; the caller calls update() afterwards, which decides whether a
            // dismissed system prompt (nothing was answered yet) brings the card back.
            enableButton.addEventListener('click', () => {
                setShown(false);
                onEnable();
            });
        }
        if (laterButton) {
            laterButton.addEventListener('click', () => {
                answered = true;
                storage.set(KEY_DISMISSED, '1');
                setShown(false);
            });
        }

        return { update };
    }

    global.DevotionalPushOffer = { create };
})(window);

(function (global) {
    'use strict';

    // Reusable share gate: a single localStorage flag that records whether the
    // visitor has shared the app/devocional. Other sections can reuse this
    // module to gate features (download buttons, banners, promo content) behind
    // a share action.
    const KEY = 'develop4God_shared';

    function hasShared(storage) {
        try {
            return storage.getItem(KEY) === '1';
        } catch (err) {
            return false;
        }
    }

    function markShared(storage) {
        try {
            storage.setItem(KEY, '1');
        } catch (err) {
            // storage may be unavailable/quota-exceeded; silent no-op
        }
    }

    function resetShared(storage) {
        try {
            storage.removeItem(KEY);
        } catch (err) {
            // silent no-op
        }
    }

    global.DevotionalShareGate = { hasShared, markShared, resetShared, KEY };
})(window);

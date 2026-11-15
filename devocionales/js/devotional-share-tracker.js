(function (global) {
    'use strict';

    // Reusable share tracker: records whether the visitor has shared the
    // app/devocional in localStorage. Other modules consult the tracker to
    // gate features (download buttons, banners, promo content) behind a share.
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

    global.DevotionalShareTracker = { hasShared, markShared, resetShared, KEY };
})(window);

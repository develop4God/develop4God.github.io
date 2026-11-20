(function (global) {
    'use strict';

    // The "open all encounters" entitlement for this browser (web only: the app's purchase is separate).
    // One local flag, written only after a completed PayPal capture. Storage is guarded: blocked or
    // corrupt storage reads as locked and never throws. A grant also holds in memory, so a payer whose
    // write was blocked is not locked again during the same visit.
    const KEY = 'develop4God_encounters_unlock_all';

    function createEncounterEntitlement(storage) {
        const json = global.StorageJson.createJsonStorage(storage);
        let grantedThisSession = false;

        const isUnlocked = () => grantedThisSession || json.read(KEY) === true;

        function grant() {
            grantedThisSession = true;
            return json.write(KEY, true);
        }

        return { isUnlocked, grant };
    }

    global.EncounterEntitlement = { createEncounterEntitlement, KEY };
})(window);

(function (global) {
    'use strict';

    // Guarded JSON access to a Storage-like object (localStorage). Every access is wrapped:
    // blocked, full or missing storage must never break rendering, it just reads as empty and
    // writes report false. Shared by the Bible-studies and Encounters stores.
    function createJsonStorage(storage) {
        function read(key) {
            try {
                const raw = storage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch (_) {
                return null;
            }
        }

        function write(key, value) {
            try {
                storage.setItem(key, JSON.stringify(value));
                return true;
            } catch (_) {
                return false;
            }
        }

        function remove(key) {
            try { storage.removeItem(key); } catch (_) { /* blocked storage: nothing to remove */ }
        }

        function readSet(key) {
            const v = read(key);
            return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
        }

        return { read, write, remove, readSet };
    }

    global.StorageJson = { createJsonStorage };
})(window);

(function (global) {
    'use strict';

    // Cache API backed {get, put, remove} for DiscoveryData. Study JSON is cached here (not in
    // localStorage: 42 studies x 10 languages exceeds its quota). Without the Cache API
    // (insecure context) it degrades to a no-op, and DiscoveryData just fetches every time.
    const KEY_PREFIX = '/__discovery__/';

    function createCacheStore(cacheStorage, name) {
        const keyFor = (key) => `${KEY_PREFIX}${encodeURIComponent(key)}`;
        const open = () => cacheStorage.open(name);

        async function get(key) {
            if (!cacheStorage) return null;
            try {
                const res = await (await open()).match(keyFor(key));
                return res ? await res.json() : null;
            } catch (_) {
                return null; // corrupt entry or unavailable storage reads as a miss
            }
        }

        async function put(key, value) {
            if (!cacheStorage) return;
            await (await open()).put(keyFor(key), new Response(JSON.stringify(value)));
        }

        async function remove(key) {
            if (!cacheStorage) return;
            await (await open()).delete(keyFor(key));
        }

        return { get, put, remove };
    }

    global.DiscoveryCache = { createCacheStore };
})(window);

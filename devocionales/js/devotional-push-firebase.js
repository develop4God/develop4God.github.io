(function (global) {
    'use strict';

    // Firebase adapter for the daily push opt-in (see DEVOCIONALES_PUSH.md). The only file that
    // knows the Firebase SDK exists: the facade and the store talk to the adapter and db interfaces.
    // Nothing here runs at load time; the SDK is injected as vendored same-origin <script> tags
    // only when load() is called, i.e. after the reader opted in, so readers who never opt in
    // download nothing and the files stay out of the service worker precache.
    // Adapter methods: supported, permission, requestPermission, load, signInAnonymously, currentUid,
    // registration (the /devocionales/ worker registration or null; the one lookup the facade uses),
    // getToken(registration), deleteToken and db.

    const SDK_BASE = '/devocionales/vendor/firebase/';
    // app first: the other compat packages register themselves on the global firebase namespace.
    const SDK_FILES = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js', 'firebase-messaging-compat.js'];
    const SCOPE = '/devocionales/';
    const REQUIRED_CONFIG = ['apiKey', 'projectId', 'messagingSenderId', 'appId'];

    const READY_TIMEOUT_MS = 10000;
    const STUCK_MEMORY_MS = 30000;

    // options.readyTimeoutMs is injectable for tests.
    function create(win, config, options) {
        const readyTimeoutMs = (options && options.readyTimeoutMs) || READY_TIMEOUT_MS;
        let loading = null;
        let loaded = false;
        // A worker that never became active: repeated calls fail at once instead of waiting again.
        let stuckUntil = 0;
        const loadedFiles = new Set();

        function firebaseConfig() {
            const fb = config && config.firebase;
            if (!fb || REQUIRED_CONFIG.some((key) => !fb[key])) {
                throw new Error('DevotionalPushFirebase: missing firebase config (config.firebase)');
            }
            return fb;
        }

        function injectScript(src) {
            return new Promise((resolve, reject) => {
                const script = win.document.createElement('script');
                script.src = src;
                script.async = false;
                script.onload = () => resolve();
                script.onerror = () => {
                    // A failed tag must not linger: a retry injects a fresh one.
                    if (typeof script.remove === 'function') script.remove();
                    reject(new Error(`DevotionalPushFirebase: failed to load ${src}`));
                };
                win.document.head.appendChild(script);
            });
        }

        async function loadSdk() {
            const fbConfig = firebaseConfig();
            // All tags exist before the first download ends: async=false downloads in parallel yet
            // executes in insertion order, so app-compat still runs before the other packages.
            // A retry loads only what failed (re-evaluating a loaded package would break it), except
            // that a failed app-compat invalidates the packages that ran without it.
            if (!loadedFiles.has(SDK_FILES[0])) loadedFiles.clear();
            const pending = SDK_FILES.filter((file) => !loadedFiles.has(file));
            const results = await Promise.allSettled(pending.map(async (file) => {
                await injectScript(SDK_BASE + file);
                loadedFiles.add(file);
            }));
            const failure = results.find((result) => result.status === 'rejected');
            if (failure) throw failure.reason;
            const firebase = win.firebase;
            if (!firebase.apps.length) firebase.initializeApp(fbConfig);
            loaded = true;
        }

        // Single flight; a failure clears the slot so a later tap can retry.
        function load() {
            if (loaded) return Promise.resolve();
            if (!loading) {
                loading = loadSdk().catch((err) => {
                    loading = null;
                    throw err;
                });
            }
            return loading;
        }

        function sdk() {
            if (!loaded) throw new Error('DevotionalPushFirebase: call load() first');
            return win.firebase;
        }

        // Async wrapper so "not loaded" surfaces as a rejection, never a synchronous throw.
        const guarded = (fn) => async (...args) => fn(sdk(), ...args);

        const db = {
            set: guarded((fb, path, data, options) => fb.firestore().doc(path).set(data, options)),
            delete: guarded((fb, path) => fb.firestore().doc(path).delete()),
            serverTimestamp: () => sdk().firestore.FieldValue.serverTimestamp(),
        };

        // The first onAuthStateChanged callback fires once persisted auth has been restored.
        function authSettled(auth) {
            return new Promise((resolve, reject) => {
                // The callback may fire before onAuthStateChanged returns, so the unsubscribe
                // function can still be unknown there; it is then called right after the return.
                let unsubscribe = null;
                let settled = false;
                unsubscribe = auth.onAuthStateChanged((user) => {
                    settled = true;
                    if (typeof unsubscribe === 'function') unsubscribe();
                    resolve(user || null);
                }, reject);
                if (settled && typeof unsubscribe === 'function') unsubscribe();
            });
        }

        async function currentUser(fb) {
            return authSettled(fb.auth());
        }

        const currentUid = guarded(async (fb) => {
            const user = await currentUser(fb);
            return user ? user.uid : null;
        });

        const signInAnonymously = guarded(async (fb) => {
            const existing = await currentUser(fb);
            if (existing) return existing.uid;
            const credential = await fb.auth().signInAnonymously();
            return credential.user.uid;
        });

        function getTokenWith(fb, registration) {
            const options = { serviceWorkerRegistration: registration };
            const vapidKey = config && config.firebase && config.firebase.vapidKey;
            if (vapidKey) options.vapidKey = vapidKey;
            return fb.messaging().getToken(options);
        }

        const getToken = guarded((fb, registration) => getTokenWith(fb, registration));

        // The registration of the real worker (scope /devocionales/): null when there is none, a rejection
        // named registration-timeout when it exists but never becomes active (not an absent subscription).
        // The facade uses it for getToken, and deleteToken binds it: without it the SDK would
        // register its default worker (/firebase-messaging-sw.js, which does not exist).
        async function registration() {
            const worker = win.navigator.serviceWorker;
            const found = await worker.getRegistration(SCOPE);
            if (!found) return null;
            if (found.active) return found;
            // A stuck install would leave `ready` pending forever and the enable button dead.
            const stuck = () => Object.assign(new Error('DevotionalPushFirebase: service worker is not active'), { name: 'registration-timeout' });
            if (Date.now() < stuckUntil) throw stuck();
            let timer;
            const timeout = new Promise((resolve, reject) => {
                timer = setTimeout(() => { stuckUntil = Date.now() + STUCK_MEMORY_MS; reject(stuck()); }, readyTimeoutMs);
            });
            try {
                return await Promise.race([worker.ready, timeout]);
            } finally {
                clearTimeout(timer);
            }
        }

        // Not granted: the browser already dropped the subscription and any SDK call here would
        // prompt or throw, so there is nothing to do (server documents are erased separately).
        // Granted: getToken binds the registration and returns the existing token, then it is deleted.
        const deleteToken = guarded(async (fb) => {
            if (permission() !== 'granted') return;
            const bound = await registration();
            if (!bound) return;
            await getTokenWith(fb, bound);
            await fb.messaging().deleteToken();
        });

        function supported() {
            return Boolean(win.Notification && win.PushManager && win.navigator && win.navigator.serviceWorker);
        }

        function permission() {
            return win.Notification ? win.Notification.permission : 'default';
        }

        // Called synchronously from the click handler so the browser sees the user gesture; both the
        // promise and the legacy callback form (old Safari) are honoured.
        function requestPermission() {
            return new Promise((resolve, reject) => {
                if (!win.Notification) {
                    reject(new Error('DevotionalPushFirebase: notifications are not supported'));
                    return;
                }
                const result = win.Notification.requestPermission(resolve);
                if (result && typeof result.then === 'function') result.then(resolve, reject);
            });
        }

        return {
            supported, permission, requestPermission, load, signInAnonymously, currentUid,
            getToken, deleteToken, registration, db,
        };
    }

    global.DevotionalPushFirebase = { create };
})(window);

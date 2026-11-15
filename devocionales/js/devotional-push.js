(function (global) {
    'use strict';

    // Opt-in daily push notifications. This facade owns the UI state machine and the order of the
    // steps; Firebase lives behind an injected `adapter` and Firestore behind a store
    // (devotional-push-store.js) that mirrors the Flutter app's writes, so everything here is
    // tested with fakes. Nothing is loaded, no Firebase request is made and no permission is asked
    // unless the reader tapped enable (or opted in earlier and the permission is still granted).

    const DEFAULT_HOUR = 8;
    const KEY_OPTED_IN = 'devotionalPush.optedIn';
    const KEY_TOKEN = 'devotionalPush.token';
    const KEY_HOUR = 'devotionalPush.hour';

    function parseHour(value) {
        const hour = Number.parseInt(value, 10);
        return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_HOUR;
    }

    // Plain localStorage access; guardStorage below is the single layer that absorbs failures.
    function defaultStorage(win) {
        return {
            get: (key) => win.localStorage.getItem(key),
            set: (key, value) => { win.localStorage.setItem(key, String(value)); },
            remove: (key) => { win.localStorage.removeItem(key); },
        };
    }

    // Any storage (injected or default) may throw or be a no-op: every access degrades to "not set".
    function guardStorage(storage) {
        const safe = (action, fallback) => {
            try {
                return action();
            } catch (err) {
                return fallback;
            }
        };
        return {
            get: (key) => safe(() => storage.get(key), null),
            set: (key, value) => { safe(() => storage.set(key, value)); },
            remove: (key) => { safe(() => storage.remove(key)); },
        };
    }

    function resolveDeps(win, deps) {
        const given = deps || {};
        const adapter = given.adapter;
        const i18n = given.i18n || global.DevotionalI18n || null;
        return {
            adapter,
            store: given.store || (adapter && global.DevotionalPushStore ? global.DevotionalPushStore.create({ db: adapter.db }) : null),
            storage: guardStorage(given.storage || defaultStorage(win)),
            i18n,
            i18nWaitMs: given.i18nWaitMs || 3000,
            // Empty (never the raw key) while translations are still loading; the view re-renders
            // when they become ready or the language changes.
            t: given.t || ((key) => (i18n ? i18n.t(key, '') : key)),
        };
    }

    // The language is unknown (and not written) until the i18n adapter has loaded translations.
    const siteLanguage = (i18n) => (i18n && typeof i18n.currentLanguage === 'function' ? i18n.currentLanguage() : undefined);

    // Resolves when translations are ready, or after `ms` so an entry can never hang on it.
    function i18nReady(i18n, ms) {
        if (!i18n || typeof i18n.whenReady !== 'function') return Promise.resolve();
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, ms);
            i18n.whenReady(() => { clearTimeout(timer); resolve(); });
        });
    }

    function browserTimezone() {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    // iOS Safari only delivers web push to an installed app, so before installing it gets a hint
    // instead of buttons. Both helpers are optional: an old cached page without them shows nothing.
    function needsInstallFirst(win) {
        const hint = global.DevotionalIosHint;
        const standalone = global.DevotionalStandalone;
        if (!hint || !standalone) return false;
        return hint.canAddToHomeScreen(win.navigator) && !standalone.isStandalone(win);
    }

    function createView(doc, t) {
        const container = doc.querySelector('[data-push]');
        const enableButton = doc.querySelector('[data-push-enable]');
        const disableButton = doc.querySelector('[data-push-disable]');
        const hourSelect = doc.querySelector('[data-push-hour]');
        const status = doc.querySelector('[data-push-status]');
        // The key, not the text, is what the view remembers: the text is rendered again whenever
        // translations become ready or the language changes.
        let statusKey = null;
        const setShown = (element, shown) => {
            if (!element) return;
            if (shown) element.classList.remove('hidden');
            else element.classList.add('hidden');
        };
        return {
            enableButton,
            disableButton,
            hourSelect,
            // The 24 options live in the static HTML (single source); this only preselects one.
            selectHour(hour) { if (hourSelect) hourSelect.value = String(hour); },
            selectedHour: () => (hourSelect ? parseHour(hourSelect.value) : null),
            message(key) {
                statusKey = key || null;
                if (status) status.textContent = statusKey ? t(statusKey) : '';
            },
            rerender() { this.message(statusKey); },
            hide: () => setShown(container, false),
            showInstallHint() {
                setShown(container, true);
                setShown(enableButton, false);
                setShown(disableButton, false);
                setShown(hourSelect, false);
                this.message('push.status_ios_install');
            },
            showState(optedIn) {
                setShown(container, true);
                setShown(enableButton, !optedIn);
                setShown(disableButton, optedIn);
                setShown(hourSelect, true);
                this.message(optedIn ? 'push.status_enabled' : null);
            },
            busy(isBusy) {
                if (enableButton) enableButton.disabled = isBusy;
                if (disableButton) disableButton.disabled = isBusy;
            },
        };
    }

    // Best-effort and never throws: each step is tried even when an earlier one failed. The
    // anonymous account and the user and settings documents stay; the existing cleanup removes
    // them once the user is silent. The local flags are cleared only when the server was told
    // (or no session exists, so there is nothing to tell); otherwise they stay so a later visit
    // retries and the reader is never shown "off" while pushes continue. Returns whether it cleared.
    async function disableFlow({ adapter, store, storage }, knownToken) {
        const attempt = async (step) => {
            try {
                await step();
                return true;
            } catch (err) {
                return false;
            }
        };
        const token = knownToken || storage.get(KEY_TOKEN);
        let uid = null;
        let told = await attempt(async () => {
            await adapter.load();
            uid = await adapter.currentUid();
        });
        if (uid) {
            told = (await attempt(() => store.saveSettings(uid, { notificationsEnabled: false }))) && told;
            if (token) await attempt(() => store.removeToken(uid, token));
        }
        await attempt(() => adapter.deleteToken());
        if (!told) return false;
        storage.remove(KEY_OPTED_IN);
        storage.remove(KEY_TOKEN);
        return true;
    }

    async function init(doc, win, config, deps) {
        try {
            const resolved = resolveDeps(win, deps);
            const { adapter, store, storage, t, i18n, i18nWaitMs } = resolved;
            if (!adapter) return;
            const view = createView(doc, t);
            const isOptedIn = () => storage.get(KEY_OPTED_IN) === '1';
            if (i18n && typeof i18n.whenReady === 'function') i18n.whenReady(() => view.rerender());
            if (i18n && typeof i18n.onLanguageChanged === 'function') i18n.onLanguageChanged(() => view.rerender());

            // No config object at all (its script failed to load) is "unknown", not "off".
            if (!config) return;
            if (config.pushEnabled !== true || config.enabled === false) {
                view.hide();
                if (isOptedIn()) await disableFlow(resolved);
                return;
            }
            if (needsInstallFirst(win)) {
                view.showInstallHint();
                return;
            }
            if (!adapter.supported()) return;

            view.selectHour(parseHour(storage.get(KEY_HOUR)));
            // The select is the source of truth; storage only remembers it for the next visit.
            const hour = () => (view.selectedHour() === null ? parseHour(storage.get(KEY_HOUR)) : view.selectedHour());
            const settings = () => ({ notificationsEnabled: true, hour: hour(), timezone: browserTimezone(), language: siteLanguage(i18n) });

            // The three writes of the app's FirestoreUserProfileStore, in its order, on every entry.
            const writeAll = async (uid, token) => {
                await store.touchUser(uid);
                await store.saveToken(uid, token);
                await store.saveSettings(uid, settings());
            };

            // The single busy flag: taps are ignored while any flow runs.
            let busy = false;
            const exclusive = async (flow) => {
                if (busy) return false;
                busy = true;
                view.busy(true);
                try {
                    await flow();
                } finally {
                    busy = false;
                    view.busy(false);
                }
                return true;
            };

            const enable = async () => {
                // The permission request runs before any other await, so the browser still sees the tap.
                let permission;
                try {
                    permission = await adapter.requestPermission();
                } catch (err) {
                    view.message('push.status_error');
                    return;
                }
                if (permission !== 'granted') {
                    view.message('push.status_denied');
                    return;
                }
                try {
                    await adapter.load();
                    const uid = await adapter.signInAnonymously();
                    const registration = await adapter.registration();
                    if (!registration) throw new Error('push: no service worker registration');
                    const token = await adapter.getToken(registration);
                    await writeAll(uid, token);
                    storage.set(KEY_OPTED_IN, '1');
                    storage.set(KEY_TOKEN, token);
                    storage.set(KEY_HOUR, hour());
                    // Without a persisted flag there would be no way to turn it off again: undo.
                    if (!isOptedIn()) {
                        await disableFlow(resolved, token);
                        view.message('push.status_error');
                        return;
                    }
                    view.showState(true);
                } catch (err) {
                    view.message('push.status_error');
                }
            };

            const disable = async () => {
                if (await disableFlow(resolved)) view.showState(false);
                else view.message('push.status_error');
            };

            // Revoked permission: the browser already dropped the subscription, so the UI is "off"
            // either way; a flag kept after a failed server write is retried on the next visit.
            const disableRevoked = async () => {
                await disableFlow(resolved);
                view.showState(false);
            };

            const rewriteSettings = async () => {
                try {
                    await adapter.load();
                    const uid = await adapter.currentUid();
                    if (!uid) throw new Error('push: no signed-in user');
                    await store.saveSettings(uid, settings());
                    view.message('push.status_enabled');
                } catch (err) {
                    view.message('push.status_error');
                }
            };

            // Silent: a failure is simply retried on the next visit.
            const enterWhileOptedIn = async () => {
                try {
                    // The language is part of the settings, so wait (bounded) until it is known.
                    await i18nReady(i18n, i18nWaitMs);
                    await adapter.load();
                    const uid = (await adapter.currentUid()) || (await adapter.signInAnonymously());
                    const registration = await adapter.registration();
                    if (!registration) return;
                    const token = await adapter.getToken(registration);
                    await writeAll(uid, token);
                    storage.set(KEY_TOKEN, token);
                } catch (err) {
                    // Retried on the next visit.
                }
            };

            if (view.enableButton) view.enableButton.addEventListener('click', () => { exclusive(enable); });
            if (view.disableButton) view.disableButton.addEventListener('click', () => { exclusive(disable); });
            if (view.hourSelect) {
                view.hourSelect.addEventListener('change', () => {
                    if (busy) {
                        view.selectHour(parseHour(storage.get(KEY_HOUR)));
                        return;
                    }
                    storage.set(KEY_HOUR, parseHour(view.hourSelect.value));
                    if (isOptedIn()) exclusive(rewriteSettings);
                });
            }

            if (i18n && typeof i18n.onLanguageChanged === 'function') {
                i18n.onLanguageChanged(() => { if (!busy && isOptedIn()) exclusive(rewriteSettings); });
            }

            if (!isOptedIn()) {
                view.showState(false);
                return;
            }
            // Revoked in the browser settings since the last visit: same path as disabling.
            if (adapter.permission() !== 'granted') {
                await exclusive(disableRevoked);
                return;
            }
            view.showState(true);
            await exclusive(enterWhileOptedIn);
        } catch (err) {
            // init never throws: the page works the same without push.
        }
    }

    global.DevotionalPush = { init };
})(window);

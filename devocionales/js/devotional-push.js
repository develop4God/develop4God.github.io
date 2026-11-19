(function (global) {
    'use strict';

    // Opt-in daily push notifications. This facade owns the UI state machine and the order of the
    // steps; Firebase lives behind an injected `adapter` and Firestore behind a store
    // (devotional-push-store.js) that mirrors the Flutter app's writes, so everything here is
    // tested with fakes. Nothing is loaded, no Firebase request is made and no permission is asked
    // unless the reader tapped enable (or opted in earlier and the permission is still granted).

    const DEFAULT_HOUR = 9;
    const KEY_OPTED_IN = 'devotionalPush.optedIn';
    const KEY_TOKEN = 'devotionalPush.token';
    const KEY_HOUR = 'devotionalPush.hour';
    // Status keys of the blocked-state help; cleared again once the permission is not denied. The generic
    // push.status_denied means "prompt dismissed" and is not one of them.
    const BLOCKED_KEYS = ['push.blocked_ios', 'push.blocked_desktop'];

    // The one hour formatter lives in the store (it writes "HH:00" to Firestore); the screen shows the same text.
    const formatHour = (hour) => global.DevotionalPushStore.formatHour(hour);

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
        // Optional (an old cached page lacks the module): without it, or when the caller gave none, logging is a no-op.
        const log = given.log || (global.DevotionalPushLog ? global.DevotionalPushLog.create(win).log : () => {});
        return {
            adapter,
            log: (step, detail) => { try { log(step, detail); } catch (err) { /* never break the flow */ } },
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

    // Push exists only in the installed app, and never on Android (native app there). Unlike the
    // manifest and install modules, a missing or broken helper is an UNKNOWN surface, not "not
    // Android": an old cached standalone script on an installed Android PWA must not show push.
    function isAppSurface(win) {
        const standalone = global.DevotionalStandalone;
        if (!standalone || typeof standalone.isStandalone !== 'function' || typeof standalone.isAndroid !== 'function') return false;
        return standalone.isStandalone(win) && !standalone.isAndroid(win.navigator);
    }

    function createView(doc, t) {
        const container = doc.querySelector('[data-push]');
        // The switch row and the time row are optional: an older cached page does not have them.
        const switchButton = doc.querySelector('[data-push-switch]');
        const switchRow = doc.querySelector('[data-push-switch-row]');
        const timeRow = doc.querySelector('[data-push-time-row]');
        const timeValue = doc.querySelector('[data-push-time-value]');
        const hourSelect = doc.querySelector('[data-push-hour]');
        const status = doc.querySelector('[data-push-status]');
        // The key (and the hour that goes after it), not the text, is what the view remembers: the
        // text is rendered again whenever translations become ready or the language changes.
        let statusKey = null;
        let statusDetail = '';
        const setShown = (element, shown) => {
            if (!element) return;
            if (shown) element.classList.remove('hidden');
            else element.classList.add('hidden');
        };
        // On: the reader is opted in. Off: the time row is greyed out and cannot be opened.
        const setOn = (on) => {
            if (switchButton) switchButton.setAttribute('aria-checked', String(on));
            if (hourSelect) hourSelect.disabled = !on;
            if (timeRow) timeRow.classList[on ? 'remove' : 'add']('is-off');
        };
        return {
            switchButton,
            hourSelect,
            // The 24 options live in the static HTML (single source); this only preselects one.
            selectHour(hour) {
                if (hourSelect) hourSelect.value = String(hour);
                if (timeValue) timeValue.textContent = formatHour(hour);
            },
            selectedHour: () => (hourSelect ? parseHour(hourSelect.value) : null),
            message(key, detail) {
                statusKey = key || null;
                statusDetail = detail || '';
                if (!status) return;
                const text = statusKey ? t(statusKey) : '';
                // The language file decides where the hour goes: "{time}" in the text. Without the placeholder
                // the hour is appended. A replacer function keeps "$" in the value literal.
                status.textContent = text.includes('{time}')
                    ? text.replace('{time}', () => statusDetail)
                    : [text, statusDetail].filter(Boolean).join(' ');
            },
            messageKey: () => statusKey,
            rerender() { this.message(statusKey, statusDetail); },
            hide: () => setShown(container, false),
            showInstallHint() {
                setShown(container, true);
                setShown(switchRow, false);
                setShown(timeRow, false);
                this.message('push.status_ios_install');
            },
            showState(optedIn) {
                setShown(container, true);
                setShown(switchRow, true);
                setShown(timeRow, true);
                setOn(optedIn);
                this.message(optedIn ? 'push.status_enabled' : null);
            },
            busy(isBusy) {
                if (switchButton) switchButton.disabled = isBusy;
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
        // Declared outside the try so the final catch can report a crash too.
        let log = () => {};
        try {
            const resolved = resolveDeps(win, deps);
            const { adapter, store, storage, t, i18n, i18nWaitMs } = resolved;
            log = resolved.log;
            if (!adapter) return;
            const view = createView(doc, t);
            const isOptedIn = () => storage.get(KEY_OPTED_IN) === '1';
            if (i18n && typeof i18n.whenReady === 'function') i18n.whenReady(() => view.rerender());
            if (i18n && typeof i18n.onLanguageChanged === 'function') i18n.onLanguageChanged(() => view.rerender());

            // No config object at all (its script failed to load) is "unknown", not "off".
            if (!config) return;
            // Surface gate first: a browser tab or Android never writes, unsubscribes or asks for
            // permission, even with a stale opted-in flag (a desktop tab shares storage with the app).
            if (!isAppSurface(win)) {
                log('init.hidden', { reason: 'not-installed-app', pushEnabled: config.pushEnabled });
                if (config.pushEnabled === true && needsInstallFirst(win)) view.showInstallHint();
                else view.hide();
                return;
            }
            if (config.pushEnabled !== true || config.enabled === false) {
                log('init.hidden', { reason: 'switched-off', pushEnabled: config.pushEnabled, enabled: config.enabled });
                view.hide();
                if (isOptedIn()) await disableFlow(resolved);
                return;
            }
            if (needsInstallFirst(win)) {
                view.showInstallHint();
                return;
            }
            if (!adapter.supported()) {
                log('init.hidden', { reason: 'unsupported-browser' });
                return;
            }
            log('init.ready', { permission: adapter.permission(), optedIn: isOptedIn() });

            // The hour last saved: where a failed save puts the row back, and what a repeated pick is compared with.
            let savedHour = parseHour(storage.get(KEY_HOUR));
            view.selectHour(savedHour);
            // Every write is told which hour to carry: the picker can already show a later pick, so it is never read.
            const settings = (hour) => ({ notificationsEnabled: true, hour, timezone: browserTimezone(), language: siteLanguage(i18n) });

            // The three writes of the app's FirestoreUserProfileStore, in its order, on every entry.
            const writeAll = async (uid, token, hour) => {
                await store.touchUser(uid);
                await store.saveToken(uid, token);
                await store.saveSettings(uid, settings(hour));
            };

            // The single busy flag: switch taps are ignored while any flow runs. A new hour or language
            // chosen meanwhile is remembered and applied once the flow ends, so nothing chosen is lost.
            let busy = false;
            let pendingHour = null;
            let languageChanged = false;
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
                await applyDeferred();
                return true;
            };

            // Platform steps for a browser-level block; the generic line where no steps exist.
            const showBlocked = () => {
                const help = global.DevotionalPushHelp;
                const key = (help && help.helpKey(win.navigator)) || 'push.status_denied';
                log('enable.blocked', { key });
                view.message(key);
            };

            // Runs after a flow: the hour picked meanwhile (when notifications are still on), then the
            // language changed meanwhile (the hour save already carries the current language).
            const applyDeferred = async () => {
                const picked = pendingHour;
                pendingHour = null;
                if (picked !== null) {
                    if (isOptedIn() && picked !== savedHour) {
                        const languagePending = languageChanged;
                        languageChanged = false; // a successful hour save carries the current language
                        await exclusive(() => changeHour(picked));
                        if (savedHour === picked) return;
                        languageChanged = languagePending; // the save failed: the language still has to be written
                    } else {
                        view.selectHour(savedHour);
                    }
                }
                if (languageChanged) {
                    languageChanged = false;
                    if (isOptedIn()) await exclusive(rewriteSettings);
                }
            };

            const enable = async () => {
                // Read before any await: what the row shows when the reader taps is what gets saved.
                const chosenHour = view.selectedHour() === null ? savedHour : view.selectedHour();
                // The permission request runs before any other await, so the browser still sees the tap.
                let permission;
                try {
                    permission = await adapter.requestPermission();
                } catch (err) {
                    log('enable.permission_error', { error: err });
                    view.message('push.status_error');
                    return;
                }
                log('enable.permission', { result: permission });
                if (permission !== 'granted') {
                    if (permission === 'denied') showBlocked();
                    else view.message('push.status_denied');
                    return;
                }
                // The last step that finished, so a failure says where the flow stopped.
                let after = 'permission';
                try {
                    await adapter.load();
                    after = 'load';
                    const uid = await adapter.signInAnonymously();
                    after = 'signInAnonymously';
                    const registration = await adapter.registration();
                    if (!registration) throw new Error('push: no service worker registration');
                    after = 'registration';
                    const token = await adapter.getToken(registration);
                    after = 'getToken';
                    await writeAll(uid, token, chosenHour);
                    log('enable.done', { hour: chosenHour });
                    storage.set(KEY_OPTED_IN, '1');
                    storage.set(KEY_TOKEN, token);
                    savedHour = chosenHour;
                    storage.set(KEY_HOUR, savedHour);
                    // Without a persisted flag there would be no way to turn it off again: undo.
                    if (!isOptedIn()) {
                        await disableFlow(resolved, token);
                        view.message('push.status_error');
                        return;
                    }
                    view.showState(true);
                } catch (err) {
                    log('enable.failed', { after, error: err });
                    view.message('push.status_error');
                }
            };

            const disable = async () => {
                if (await disableFlow(resolved)) view.showState(false);
                else view.message('push.status_error_off');
            };

            // Revoked permission: the browser already dropped the subscription, so the UI is "off"
            // either way; a flag kept after a failed server write is retried on the next visit.
            const disableRevoked = async () => {
                await disableFlow(resolved);
                view.showState(false);
            };

            const rewriteSettings = async () => {
                try {
                    await saveSettingsNow(savedHour);
                    view.message('push.status_enabled');
                } catch (err) {
                    log('settings.failed', { error: err });
                    view.message('push.status_error');
                }
            };

            // Writes the settings document for the signed-in reader; throws when it cannot.
            const saveSettingsNow = async (hour) => {
                await adapter.load();
                const uid = await adapter.currentUid();
                if (!uid) throw new Error('push: no signed-in user');
                await store.saveSettings(uid, settings(hour));
            };

            // Saves the picked hour. A failure puts the row back on the last saved hour, so the screen
            // never shows a time the server does not have.
            const changeHour = async (next) => {
                try {
                    await saveSettingsNow(next);
                    savedHour = next;
                    storage.set(KEY_HOUR, next);
                    view.message('push.time_set_at', formatHour(next));
                } catch (err) {
                    log('hour.failed', { hour: next, error: err });
                    view.selectHour(savedHour);
                    view.message('push.time_error');
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
                    await writeAll(uid, token, savedHour);
                    storage.set(KEY_TOKEN, token);
                } catch (err) {
                    // Retried on the next visit.
                    log('resume.failed', { error: err });
                }
            };

            // The offer card and the blocked help follow the opt-in state and the browser permission.
            const offerModule = global.DevotionalPushOffer;
            const offer = offerModule && offerModule.create(doc, {
                storage,
                isEligible: () => !isOptedIn() && adapter.permission() === 'default',
                onEnable: () => { run(enable); },
            });
            const refreshPermissionUi = () => {
                if (adapter.permission() === 'denied') showBlocked();
                else if (BLOCKED_KEYS.includes(view.messageKey())) view.message(null);
                if (offer) offer.update();
            };
            // A flow already set its own message, so afterwards only the card is re-evaluated.
            const run = (flow) => exclusive(flow).then(() => { if (offer) offer.update(); });
            // Back from the system settings: the permission may have changed without a reload. Revoked while
            // opted in is the same path as at load; nothing runs while another flow is in progress.
            if (typeof doc.addEventListener === 'function') {
                doc.addEventListener('visibilitychange', () => {
                    if (doc.visibilityState !== 'visible' || busy) return;
                    if (isOptedIn() && adapter.permission() !== 'granted') exclusive(disableRevoked).then(refreshPermissionUi);
                    else refreshPermissionUi();
                });
            }

            // One switch: off -> enable (asks for the permission inside this tap), on -> disable.
            if (view.switchButton) view.switchButton.addEventListener('click', () => { run(isOptedIn() ? disable : enable); });
            if (view.hourSelect) {
                view.hourSelect.addEventListener('change', () => {
                    // Notifications are off (the row is disabled then, so this is only a guard).
                    if (!isOptedIn()) {
                        view.selectHour(savedHour);
                        return;
                    }
                    const next = parseHour(view.hourSelect.value);
                    if (busy) {
                        // Shown now, saved when the running flow ends.
                        pendingHour = next;
                        view.selectHour(next);
                        return;
                    }
                    if (next === savedHour) return;
                    view.selectHour(next);
                    exclusive(() => changeHour(next));
                });
            }

            if (i18n && typeof i18n.onLanguageChanged === 'function') {
                i18n.onLanguageChanged(() => {
                    if (busy) languageChanged = true;
                    else if (isOptedIn()) exclusive(rewriteSettings);
                });
            }

            if (!isOptedIn()) {
                view.showState(false);
                refreshPermissionUi();
                return;
            }
            // Revoked in the browser settings since the last visit: same path as disabling.
            if (adapter.permission() !== 'granted') {
                await exclusive(disableRevoked);
                refreshPermissionUi();
                return;
            }
            view.showState(true);
            refreshPermissionUi();
            await exclusive(enterWhileOptedIn);
        } catch (err) {
            // init never throws: the page works the same without push.
            log('init.crashed', { error: err });
        }
    }

    global.DevotionalPush = { init };
})(window);

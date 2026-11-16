// Daily push notifications on the reader: dormant by default, and when switched on it only offers
// the button. Nothing talks to Firebase and no permission is requested before an explicit tap.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const READER = '/devocionales/?lang=en';
const FIREBASE_HOST = /firebase|gstatic|googleapis|fcm\./i;
const FIREBASE_VENDOR = /\/devocionales\/vendor\/firebase\//;

// Records every request that would reach Firebase, by host or by the vendored SDK path.
function watchFirebase(page) {
    const hits = [];
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (FIREBASE_HOST.test(url.hostname) || FIREBASE_VENDOR.test(url.pathname)) hits.push(request.url());
    });
    return hits;
}

// Serves the real config with pushEnabled forced to `value`, so a test never depends on the shipped default.
async function forcePushEnabled(page, value) {
    await page.route('**/devocionales/js/devotional-pwa-config.js', async (route) => {
        const response = await route.fetch();
        const body = (await response.text()).replace(/pushEnabled: (true|false)/, `pushEnabled: ${value}`);
        await route.fulfill({ response, body });
    });
}

// Serves the real config with pushEnabled forced on, and an adapter stub in place of the Firebase
// adapter file, so production code is untouched and no real Firebase call is possible.
async function enablePushWithStubAdapter(page, { permission = 'denied' } = {}) {
    await forcePushEnabled(page, true);
    await page.route('**/devocionales/js/devotional-push-firebase.js', (route) => route.fulfill({
        contentType: 'text/javascript',
        body: `window.__adapterCalls = [];
window.__registration = { scope: '/devocionales/', active: {} };
window.DevotionalPushFirebase = { create: function () {
    var log = function (name) { window.__adapterCalls.push(name); };
    return {
        supported: function () { return true; },
        permission: function () { return 'default'; },
        requestPermission: function () { log('requestPermission'); return Promise.resolve('${permission}'); },
        load: function () { log('load'); return Promise.resolve(); },
        signInAnonymously: function () { log('signInAnonymously'); window.__uid = 'uid'; return Promise.resolve('uid'); },
        currentUid: function () { return Promise.resolve(window.__uid || null); },
        registration: function () { log('registration'); return Promise.resolve(window.__registration); },
        getToken: function (reg) { log(reg === window.__registration ? 'getToken' : 'getToken(wrong registration)'); return Promise.resolve('t'); },
        deleteToken: function () { return Promise.resolve(); },
        db: {
            set: function (path) { log('db.set ' + path); return window.__failWrites ? Promise.reject(new Error('offline')) : Promise.resolve(); },
            get: function () { return Promise.resolve({ exists: false, data: function () {} }); },
            delete: function () { return Promise.resolve(); },
            serverTimestamp: function () { return 'ts'; }
        }
    };
} };`,
    }));
    // Counts any permission prompt the page itself could raise.
    await page.addInitScript(() => {
        window.__prompts = 0;
        if (window.Notification) {
            Notification.requestPermission = () => { window.__prompts += 1; return Promise.resolve('default'); };
        }
    });
}

// In the installed app the push block lives in the Settings tab.
async function openSettings(page) {
    await page.locator('[data-shell-tab="settings"]').click();
}

// Push only exists in the installed app: pretend to be launched from the home screen.
async function launchAsInstalledApp(page) {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
}

test('the kill switch: with pushEnabled false the push block is hidden and Firebase is never contacted', async ({ page }) => {
    const hits = watchFirebase(page);
    await forcePushEnabled(page, false);
    await page.goto(READER, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-push]')).toBeHidden();
    expect(await page.evaluate(() => window.DevotionalPwaConfig.pushEnabled)).toBe(false);
    expect(hits).toEqual([]);
});

test('the push block keeps every id an older cached script reads', async ({ page }) => {
    await page.goto(READER, { waitUntil: 'domcontentloaded' });
    for (const id of ['install-app-btn', 'ios-install-hint', 'page-footer', 'footer-privacy-link']) {
        await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    expect(await page.locator('[data-push-hour] option').count()).toBe(24);
    expect(await page.locator('[data-push-hour] option').first().textContent()).toBe('00:00');
    expect(await page.locator('[data-push-hour] option').last().textContent()).toBe('23:00');
});

test('with pushEnabled on, the switch shows off and nothing runs before it is tapped', async ({ page }) => {
    const hits = watchFirebase(page);
    await launchAsInstalledApp(page);
    await enablePushWithStubAdapter(page);
    await page.goto(READER, { waitUntil: 'networkidle' });
    await openSettings(page);
    await expect(page.locator('[data-push]')).toBeVisible();
    await expect(page.locator('[data-push-switch]')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('[data-push-hour]')).toBeDisabled();
    expect(await page.evaluate(() => window.__prompts)).toBe(0);
    expect(await page.evaluate(() => window.__adapterCalls)).toEqual([]);
    expect(hits).toEqual([]);
});

test('tapping the switch asks for permission first; a denial shows the message, leaves it off and loads no SDK', async ({ page }) => {
    const hits = watchFirebase(page);
    await launchAsInstalledApp(page);
    await enablePushWithStubAdapter(page);
    await page.goto(READER, { waitUntil: 'networkidle' });
    await openSettings(page);
    await page.locator('[data-push-switch]').click();
    await expect(page.locator('[data-push-status]')).toContainText('blocked');
    await expect(page.locator('[data-push-switch]')).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => window.__adapterCalls)).toEqual(['requestPermission']);
    expect(hits).toEqual([]);
});

test('with pushEnabled off, a stale opted-in flag does not reveal the block', async ({ page }) => {
    await forcePushEnabled(page, false);
    // The unsubscribe the kill switch runs may legitimately contact Firebase to erase the reader's data.
    await page.addInitScript(() => localStorage.setItem('devotionalPush.optedIn', '1'));
    await page.goto(READER, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-push]')).toBeHidden();
});

test('granted path: requestPermission first, then load, sign-in, registration, token and the three writes', async ({ page }) => {
    await launchAsInstalledApp(page);
    await enablePushWithStubAdapter(page, { permission: 'granted' });
    await page.goto(READER, { waitUntil: 'networkidle' });
    await openSettings(page);
    await page.locator('[data-push-switch]').click();
    await expect(page.locator('[data-push-switch]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-push-hour]')).toBeEnabled();
    expect(await page.evaluate(() => window.__adapterCalls)).toEqual([
        'requestPermission',
        'load',
        'signInAnonymously',
        'registration',
        'getToken',
        'db.set users/uid',
        'db.set users/uid/fcmTokens/t',
        'db.set users/uid/settings/notifications',
    ]);
    expect(await page.evaluate(() => localStorage.getItem('devotionalPush.optedIn'))).toBe('1');
});

test('a browser tab with pushEnabled on shows no push block and never reaches Firebase', async ({ page }) => {
    const hits = watchFirebase(page);
    await page.addInitScript(() => localStorage.setItem('devotionalPush.optedIn', '1'));
    await enablePushWithStubAdapter(page);
    await page.goto(READER, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-push]')).toBeHidden();
    expect(await page.evaluate(() => window.__adapterCalls)).toEqual([]);
    expect(await page.evaluate(() => window.__prompts)).toBe(0);
    expect(hits).toEqual([]);
});

test('an installed app on Android shows no push block and never reaches Firebase', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36' });
    const page = await context.newPage();
    const hits = watchFirebase(page);
    await page.addInitScript(() => localStorage.setItem('devotionalPush.optedIn', '1'));
    await launchAsInstalledApp(page);
    await enablePushWithStubAdapter(page);
    await page.goto(READER, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-push]')).toBeHidden();
    expect(await page.evaluate(() => window.__adapterCalls)).toEqual([]);
    expect(hits).toEqual([]);
    await context.close();
});

// ---- Settings screen: one switch and one time row ----

async function openSettingsAndTurnOn(page) {
    await launchAsInstalledApp(page);
    await enablePushWithStubAdapter(page, { permission: 'granted' });
    await page.goto(READER, { waitUntil: 'networkidle' });
    await openSettings(page);
    await page.locator('[data-push-switch]').click();
    await expect(page.locator('[data-push-switch]')).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => { window.__adapterCalls.length = 0; });
}

const settingsWrites = (page) => page.evaluate(() => window.__adapterCalls.filter((call) => call.startsWith('db.set')));

test('the time starts at 09:00; picking 18:00 saves the settings once and says so', async ({ page }) => {
    await launchAsInstalledApp(page);
    await enablePushWithStubAdapter(page, { permission: 'granted' });
    await page.goto(READER, { waitUntil: 'networkidle' });
    await openSettings(page);
    await expect(page.locator('[data-push-hour]')).toHaveValue('9');
    await expect(page.locator('[data-push-time-value]')).toHaveText('09:00');
    await page.locator('[data-push-switch]').click();
    await expect(page.locator('[data-push-hour]')).toBeEnabled();
    await page.evaluate(() => { window.__adapterCalls.length = 0; });
    await page.locator('[data-push-hour]').selectOption('18');
    await expect(page.locator('[data-push-status]')).toHaveText('Notification time set to 18:00');
    await expect(page.locator('[data-push-time-value]')).toHaveText('18:00');
    expect(await settingsWrites(page)).toEqual(['db.set users/uid/settings/notifications']);
    expect(await page.evaluate(() => localStorage.getItem('devotionalPush.hour'))).toBe('18');
});

test('picking the same hour again saves nothing and changes no text', async ({ page }) => {
    await openSettingsAndTurnOn(page);
    const before = await page.locator('[data-push-status]').textContent();
    await page.locator('[data-push-hour]').selectOption('9');
    expect(await settingsWrites(page)).toEqual([]);
    await expect(page.locator('[data-push-status]')).toHaveText(before);
});

test('a failed save puts the row back on the last saved hour and shows the error', async ({ page }) => {
    await openSettingsAndTurnOn(page);
    await page.evaluate(() => { window.__failWrites = true; });
    await page.locator('[data-push-hour]').selectOption('21');
    await expect(page.locator('[data-push-status]')).toHaveText('Error setting notification time');
    await expect(page.locator('[data-push-hour]')).toHaveValue('9');
    await expect(page.locator('[data-push-time-value]')).toHaveText('09:00');
    expect(await page.evaluate(() => localStorage.getItem('devotionalPush.hour'))).toBe('9');
    // Back online, the same pick is saved: the failed hour was not remembered as saved.
    await page.evaluate(() => { window.__failWrites = false; window.__adapterCalls.length = 0; });
    await page.locator('[data-push-hour]').selectOption('21');
    await expect(page.locator('[data-push-status]')).toHaveText('Notification time set to 21:00');
    expect(await settingsWrites(page)).toEqual(['db.set users/uid/settings/notifications']);
});

test('turning the switch off clears the opt-in and greys the time row again', async ({ page }) => {
    await openSettingsAndTurnOn(page);
    await page.locator('[data-push-switch]').click();
    await expect(page.locator('[data-push-switch]')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('[data-push-hour]')).toBeDisabled();
    await expect(page.locator('[data-push-time-row]')).toHaveClass(/is-off/);
    expect(await page.evaluate(() => localStorage.getItem('devotionalPush.optedIn'))).toBeNull();
});

test('the time row has an accessible name, and the whole row opens the native picker', async ({ page }) => {
    await openSettingsAndTurnOn(page);
    const row = page.locator('[data-push-time-row]');
    await expect(page.locator('[data-push-hour]')).toHaveAccessibleName(/Daily notification time/);
    const rowBox = await row.boundingBox();
    const selectBox = await page.locator('[data-push-hour]').boundingBox();
    expect(rowBox.height).toBeGreaterThanOrEqual(44);
    expect(selectBox.width).toBeGreaterThanOrEqual(rowBox.width - 1);
    expect(selectBox.height).toBeGreaterThanOrEqual(rowBox.height - 1);
});

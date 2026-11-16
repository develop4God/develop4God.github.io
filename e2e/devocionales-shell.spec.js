// The installed-app shell: Home and Settings tabs (bottom bar on phones, labelled rail from 768px),
// only in the installed app on iOS and desktop. A browser tab and Android keep the plain page.
// Set SHELL_SHOTS=<dir> to also save a screenshot of every layout there.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const READER = '/devocionales/?lang=en';
const SHOTS = process.env.SHELL_SHOTS || '';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36';
const PHONE = { width: 390, height: 844 };
// 800, not 768: desktop WebKit's classic scrollbar (8px) is taken off the width its media queries see, so
// exactly 768 is still the phone layout there. Real iPads use overlay scrollbars. The boundary itself is
// covered by the resize test and by the unit-level config value.
const TABLET = { width: 800, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

const old = (file) => fs.readFileSync(path.join(__dirname, 'fixtures', 'previous-deploy', `${file}.txt`), 'utf8');

function trackErrors(page) {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    return errors;
}

// iOS home-screen app.
const installedIos = (page) => page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));

// Desktop install: only the display-mode query answers true, every other query stays real.
const installedDesktop = (page) => page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
        const result = real(query);
        if (query !== '(display-mode: standalone)') return result;
        return new Proxy(result, {
            get(target, key) {
                if (key === 'matches') return true;
                const value = target[key];
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
    };
});

// Serves the real config with push switched on (the Firebase adapter is stubbed: nothing real runs).
async function pushOnWithStubAdapter(page) {
    await page.route('**/devocionales/js/devotional-pwa-config.js', async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('pushEnabled: false', 'pushEnabled: true') });
    });
    await page.route('**/devocionales/js/devotional-push-firebase.js', (route) => route.fulfill({
        contentType: 'text/javascript',
        body: `window.DevotionalPushFirebase = { create: function () { return {
            supported: function () { return true; }, permission: function () { return 'default'; },
            requestPermission: function () { return Promise.resolve('denied'); }, load: function () { return Promise.resolve(); },
            signInAnonymously: function () { return Promise.resolve('uid'); }, currentUid: function () { return Promise.resolve(null); },
            registration: function () { return Promise.resolve(null); }, getToken: function () { return Promise.resolve('t'); },
            deleteToken: function () { return Promise.resolve(); },
            db: { set: function () { return Promise.resolve(); }, get: function () { return Promise.resolve({ exists: false, data: function () {} }); }, delete: function () { return Promise.resolve(); }, serverTimestamp: function () { return 'ts'; } }
        }; } };`,
    }));
}

async function open(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto(READER, { waitUntil: 'networkidle' });
    await expect(page.locator('#devotional-verse-ref')).not.toHaveText('');
}

async function shot(page, name) {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${page.context().browser().browserType().name()}-${name}.png`) });
}

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// Every link a person can reach (rendered, not inert) that breaks the allow-list. Judged twice: by
// a rule written here, independent of the code under test, and by the production predicate.
async function disallowedLinks(page) {
    return page.evaluate(() => {
        const contact = window.DevotionalPwaConfig.surfaces.shell.contactAddress.toLowerCase();
        const external = [
            [/^(www\.)?paypal\.com$/, '/paypalme/'], [/^wa\.me$/, '/'], [/^(www\.)?facebook\.com$/, '/sharer'],
            [/^(x|twitter)\.com$/, '/intent/'], [/^t\.me$/, '/share'], [/^(www\.)?(bible|biblegateway)\.com$/, '/'],
        ];
        const reachable = (a) => !a.closest('[inert]') && a.getClientRects().length > 0 && getComputedStyle(a).visibility !== 'hidden';
        const bad = [];
        for (const a of document.querySelectorAll('a[href]')) {
            if (!reachable(a)) continue;
            const url = new URL(a.getAttribute('href'), location.href);
            let fine;
            if (url.protocol === 'mailto:') fine = decodeURIComponent(url.pathname).toLowerCase() === contact;
            else if (url.origin === location.origin) fine = url.pathname === '/devocionales' || url.pathname.startsWith('/devocionales/');
            else {
                fine = url.protocol === 'https:' && a.target === '_blank' && /\bnoopener\b/.test(a.rel)
                    && external.some(([host, prefix]) => host.test(url.hostname) && url.pathname.startsWith(prefix));
            }
            const production = window.DevotionalShellCore.isAllowedLink({ href: a.getAttribute('href'), target: a.target, rel: a.rel }, location.origin, contact);
            if (!fine || !production) bad.push(a.href);
        }
        return bad;
    });
}

test.describe('browser tab: the plain page, no shell', () => {
    for (const [label, viewport] of [['phone', PHONE], ['tablet', TABLET], ['desktop', DESKTOP]]) {
        test(`${label}: no shell classes, no tab bar, the reader is shown`, async ({ page }) => {
            const errors = trackErrors(page);
            await open(page, viewport);
            await expect(page.locator('html')).not.toHaveClass(/shell-active/);
            await expect(page.locator('[data-shell-nav]')).toBeHidden();
            await expect(page.locator('[data-shell-settings-header]')).toBeHidden();
            await expect(page.locator('main')).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.dataset.shellView)).toBeUndefined();
            await shot(page, `tab-${label}`);
            expect(errors).toEqual([]);
        });
    }

    test('push stays out of the way: no block with the default config, and no Settings heading', async ({ page }) => {
        await open(page, PHONE);
        await expect(page.locator('[data-push]')).toBeHidden();
    });
});

test.describe('installed iOS app on a phone (390px)', () => {
    test('bottom bar with Home and Settings; Home first; no horizontal scroll', async ({ page }) => {
        const errors = trackErrors(page);
        await installedIos(page);
        await open(page, PHONE);
        await expect(page.locator('html')).toHaveClass(/shell-active/);
        expect(await page.evaluate(() => document.documentElement.dataset.shellLayout)).toBe('bar');
        const nav = page.locator('[data-shell-nav]');
        await expect(nav).toBeVisible();
        const box = await nav.boundingBox();
        expect(Math.round(box.y + box.height)).toBe(PHONE.height);
        expect(Math.round(box.width)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
        await expect(page.locator('[data-shell-tab="home"]')).toContainText('Home');
        await expect(page.locator('[data-shell-tab="settings"]')).toContainText('Settings');
        await expect(page.locator('[data-shell-tab="home"]')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('main')).toBeVisible();
        await expect(page.locator('[data-shell-settings]')).toBeHidden();
        expect(await noHorizontalScroll(page)).toBe(true);
        await shot(page, 'ios-phone-home');
        expect(errors).toEqual([]);
    });

    test('tab switching shows one tab at a time and moves aria-current', async ({ page }) => {
        await installedIos(page);
        await open(page, PHONE);
        await page.locator('[data-shell-tab="settings"]').click();
        await expect(page.locator('[data-shell-settings]')).toBeVisible();
        await expect(page.locator('#shell-settings-title')).toHaveText('Settings');
        await expect(page.locator('main')).toBeHidden();
        await expect(page.locator('[data-shell-tab="settings"]')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('[data-shell-tab="home"]')).not.toHaveAttribute('aria-current', 'page');
        await shot(page, 'ios-phone-settings');
        await page.locator('[data-shell-tab="home"]').click();
        await expect(page.locator('main')).toBeVisible();
        await expect(page.locator('[data-shell-settings]')).toBeHidden();
    });

    test('tab labels follow the language', async ({ page }) => {
        await installedIos(page);
        await page.setViewportSize(PHONE);
        await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });
        await expect(page.locator('[data-shell-tab="home"]')).toContainText('Inicio');
        await expect(page.locator('[data-shell-tab="settings"]')).toContainText('Ajustes');
    });

    test('push appears only in the Settings tab, never on Home', async ({ page }) => {
        await installedIos(page);
        await pushOnWithStubAdapter(page);
        await open(page, PHONE);
        await expect(page.locator('[data-push]')).toBeHidden();
        await page.locator('[data-shell-tab="settings"]').click();
        await expect(page.locator('[data-push]')).toBeVisible();
        await expect(page.locator('[data-push-enable]')).toBeVisible();
        await shot(page, 'ios-phone-settings-push');
        await page.locator('[data-shell-tab="home"]').click();
        await expect(page.locator('[data-push]')).toBeHidden();
    });

    test('opens on Home every time: the selected tab is not stored', async ({ page }) => {
        await installedIos(page);
        await open(page, PHONE);
        await page.locator('[data-shell-tab="settings"]').click();
        await page.reload({ waitUntil: 'networkidle' });
        await expect(page.locator('[data-shell-tab="home"]')).toHaveAttribute('aria-current', 'page');
        const stored = await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter((key) => /shell|tab/i.test(key)));
        expect(stored).toEqual([]);
    });

    test('tab taps are reported as bottom_bar_action, once per change', async ({ page }) => {
        await installedIos(page);
        await open(page, PHONE);
        await page.evaluate(() => {
            window.__events = [];
            window.gtag = (...args) => { if (args[0] === 'event') window.__events.push(args.slice(1)); };
        });
        await page.locator('[data-shell-tab="settings"]').click();
        await page.locator('[data-shell-tab="settings"]').click();
        await page.locator('[data-shell-tab="home"]').click();
        expect(await page.evaluate(() => window.__events)).toEqual([
            ['bottom_bar_action', { action: 'settings' }],
            ['bottom_bar_action', { action: 'home' }],
        ]);
    });
});

test.describe('installed desktop app (display-mode: standalone)', () => {
    for (const [label, viewport] of [['tablet 800px', TABLET], ['desktop 1280px', DESKTOP]]) {
        test(`${label}: a labelled rail on the left and a reading column of at most 720px`, async ({ page }) => {
            const errors = trackErrors(page);
            await installedDesktop(page);
            await open(page, viewport);
            await expect(page.locator('html')).toHaveClass(/shell-active/);
            expect(await page.evaluate(() => document.documentElement.dataset.shellLayout)).toBe('rail');
            const nav = await page.locator('[data-shell-nav]').boundingBox();
            expect(nav.x).toBe(0);
            expect(nav.y).toBe(0);
            expect(Math.round(nav.height)).toBe(viewport.height);
            expect(nav.width).toBeLessThan(240);
            await expect(page.locator('[data-shell-tab="home"] span')).toBeVisible();
            await expect(page.locator('[data-shell-tab="settings"] span')).toBeVisible();
            const main = await page.locator('main').boundingBox();
            expect(main.width).toBeLessThanOrEqual(720);
            expect(main.x).toBeGreaterThanOrEqual(nav.width);
            expect(await noHorizontalScroll(page)).toBe(true);
            await shot(page, `desktop-${viewport.width}-home`);
            await page.locator('[data-shell-tab="settings"]').click();
            const settings = await page.locator('[data-shell-settings]').boundingBox();
            expect(settings.width).toBeLessThanOrEqual(720);
            await shot(page, `desktop-${viewport.width}-settings`);
            expect(errors).toEqual([]);
        });
    }

    test('resizing across 768px swaps the rail and the bar', async ({ page }) => {
        await installedDesktop(page);
        await open(page, DESKTOP);
        expect(await page.evaluate(() => document.documentElement.dataset.shellLayout)).toBe('rail');
        await page.setViewportSize(PHONE);
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.shellLayout)).toBe('bar');
    });
});

test.describe('installed Android app: native app territory, no shell and no push', () => {
    test.use({ userAgent: ANDROID_UA, hasTouch: true });

    test('standalone on Android gets the plain page and no push block', async ({ page }) => {
        const errors = trackErrors(page);
        await installedIos(page);
        await pushOnWithStubAdapter(page);
        await open(page, PHONE);
        await expect(page.locator('html')).not.toHaveClass(/shell-active/);
        await expect(page.locator('[data-shell-nav]')).toBeHidden();
        await expect(page.locator('[data-push]')).toBeHidden();
        await expect(page.locator('main')).toBeVisible();
        expect(errors).toEqual([]);
    });
});

test.describe('kill switches and unknown surfaces', () => {
    test('surfaces.shell.enabled:false keeps the installed app on the plain page', async ({ page }) => {
        await installedIos(page);
        await page.route('**/devocionales/js/devotional-pwa-config.js', async (route) => {
            const response = await route.fetch();
            const body = (await response.text()).replace(/(shell: \{\s*\/\/[^\n]*\n\s*enabled: )true/, '$1false');
            await route.fulfill({ response, body });
        });
        await open(page, PHONE);
        expect(await page.evaluate(() => window.DevotionalPwaConfig.surfaces.shell.enabled)).toBe(false);
        await expect(page.locator('html')).not.toHaveClass(/shell-active/);
        await expect(page.locator('[data-shell-nav]')).toBeHidden();
    });

    test('a config without a surfaces block (the previous deploy) gives no shell', async ({ page }) => {
        const errors = trackErrors(page);
        await installedIos(page);
        await page.route('**/devocionales/js/devotional-pwa-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: old('devotional-pwa-config.js') }));
        await open(page, PHONE);
        await expect(page.locator('html')).not.toHaveClass(/shell-active/);
        await expect(page.locator('main')).toBeVisible();
        expect(errors).toEqual([]);
    });
});

test.describe('link allow-list in the installed shell', () => {
    for (const [label, viewport, install] of [['phone', PHONE, installedIos], ['desktop', DESKTOP, installedDesktop]]) {
        test(`${label}: on both tabs every reachable link stays in /devocionales/ or is an allowed external one`, async ({ page }) => {
            await install(page);
            await pushOnWithStubAdapter(page);
            await open(page, viewport);
            await expect(page.locator('html')).toHaveClass(/shell-active/);
            expect(await disallowedLinks(page)).toEqual([]);
            await page.locator('[data-shell-tab="settings"]').click();
            expect(await disallowedLinks(page)).toEqual([]);
            // Google Play is never reachable in the app, whatever the loader unhides.
            await page.evaluate(() => document.querySelectorAll('#app-banner, #download-app-android-btn').forEach((el) => el.classList.remove('hidden')));
            for (const selector of ['#app-banner-cta', '#download-app-android-btn']) {
                await expect(page.locator(selector)).toBeHidden();
            }
        });
    }

    test('the audit goes red when a Google Play, foreign, home or unsafe external link is reachable', async ({ page }) => {
        await installedIos(page);
        await open(page, PHONE);
        await page.evaluate(() => {
            const add = (href, attrs) => {
                const a = document.createElement('a');
                a.href = href;
                a.textContent = href;
                Object.assign(a, attrs);
                document.querySelector('main').prepend(a);
            };
            add('https://play.google.com/store/apps/details?id=x', { target: '_blank', rel: 'noopener' });
            add('https://example.com/', {});
            add('/habitus/', {});
            add('https://www.paypal.com/paypalme/develop4godOfficial', {});
        });
        const bad = (await disallowedLinks(page)).join(' ');
        for (const part of ['play.google.com', 'example.com', '/habitus/', 'paypal.com']) expect(bad).toContain(part);
    });
});

test.describe('replay across a deploy', () => {
    test('previous manifest/install/render/standalone scripts against the new HTML still render in the installed app', async ({ page }) => {
        const errors = trackErrors(page);
        await installedIos(page);
        for (const file of ['devotional-manifest.js', 'devotional-install.js', 'devotional-render-dom.js', 'devotional-standalone.js']) {
            await page.route(`**/devocionales/js/${file}`, (route) => route.fulfill({ contentType: 'text/javascript', body: old(file) }));
        }
        await open(page, PHONE);
        // The previous standalone script has no isAndroid: the surface is unknown, so no shell.
        await expect(page.locator('html')).not.toHaveClass(/shell-active/);
        await expect(page.locator('main')).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('new scripts against the previous HTML (no shell markup) leave the page alone', async ({ page }) => {
        const errors = trackErrors(page);
        await installedIos(page);
        await page.route('**/devocionales/?*', (route) => route.fulfill({ contentType: 'text/html', body: old('index.html') }));
        await page.goto(READER, { waitUntil: 'networkidle' });
        await expect(page.locator('#devotional-verse-ref')).not.toHaveText('');
        await expect(page.locator('html')).not.toHaveClass(/shell-active/);
        expect(errors).toEqual([]);
    });

    test('every id the previous cached scripts read is still in the page, push ids included', async ({ page }) => {
        await page.goto(READER, { waitUntil: 'domcontentloaded' });
        const ids = ['nav-vision-label', 'install-app-btn', 'ios-install-hint', 'page-footer', 'footer-privacy-link', 'app-banner', 'download-app-android-btn',
            'push-hour', 'push-enable-btn', 'push-disable-btn', 'push-status', 'back-link'];
        for (const id of ids) await expect(page.locator(`#${id}`)).toHaveCount(1);
    });
});

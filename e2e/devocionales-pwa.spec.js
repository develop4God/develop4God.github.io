// The devocionales reader as an installable, offline-capable app: manifest, service worker,
// offline shell, a devotional already read opening offline, safe updates, and the install button.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

test.use({ serviceWorkers: 'allow' });

const READER = '/devocionales/?lang=en';
const SITE_ROOT = path.join(__dirname, '..');
const CONTENT_TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2',
};

// Serves the repo as a static site; `state.overrides` maps a URL path to JavaScript source served
// instead of the file on disk, which is how a test simulates a new deploy.
function startSiteServer(state) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            if (pathname.endsWith('/')) pathname += 'index.html';
            if (state.overrides[pathname]) {
                res.writeHead(200, { 'content-type': 'text/javascript' });
                return res.end(state.overrides[pathname]);
            }
            const file = path.resolve(SITE_ROOT, `.${pathname}`);
            if (!file.startsWith(SITE_ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404);
                return res.end();
            }
            res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' });
            return fs.createReadStream(file).pipe(res);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

// Registers the worker, waits for it to take control, and reloads online once so the devotional
// data the page fetches is saved by the worker (the first load happens before it is active).
async function installWorker(page, base = '') {
    await page.goto(`${base}${READER}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'networkidle' });
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

const cacheNames = (page) => page.evaluate(() => caches.keys());

test('the manifest is linked and describes an installable standalone app', async ({ page, request }) => {
    await page.goto(READER, { waitUntil: 'domcontentloaded' });
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(href)).json();
    expect(manifest).toMatchObject({ scope: '/devocionales/', display: 'standalone', id: '/devocionales/' });
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
});

test('a worker scoped to /devocionales/ takes control and precaches one build', async ({ page, request }) => {
    await installWorker(page);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope);
    expect(new URL(scope).pathname).toBe('/devocionales/');
    const source = await (await request.get('/devocionales/sw.js')).text();
    const version = source.match(/version\\":\\"([0-9a-f]{12})/)[1];
    expect(await cacheNames(page)).toContain(`devocionales-${version}`);
});

test('the first worker takes control of the page that registered it, so the first visit is cached', async ({ page }) => {
    await page.goto(READER, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
});

test.describe('offline', () => {
    test.setTimeout(45_000);

    test('the page opens fully styled, with icons and the Inter font, with no network', async ({ page, context }) => {
        await installWorker(page);
        await context.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded' });

        await expect(page).toHaveTitle(/Devocional/);
        const icon = page.locator('svg.lucide-mail.w-4');
        await expect(icon).toBeVisible();
        await expect(icon).toHaveCSS('width', '16px'); // a Tailwind rule, so the stylesheet came from cache
        const interLoaded = await page.evaluate(async () => {
            await document.fonts.ready;
            return [...document.fonts].some((face) => face.family.replace(/"/g, '') === 'Inter' && face.status === 'loaded');
        });
        expect(interLoaded).toBe(true);
    });

    test('a devotional already read opens again with no network', async ({ page, context }) => {
        await installWorker(page);
        const heading = page.locator('h1').first();
        await expect(heading).not.toHaveText('');
        const online = await heading.textContent();
        await expect.poll(async () => (await page.evaluate(async () => (await (await caches.open('devocionales-data')).keys()).length))).toBeGreaterThan(0);

        await context.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('h1').first()).toHaveText(online);
    });

    test('the legal pages open styled with no network', async ({ page, context }) => {
        await installWorker(page);
        await context.setOffline(true);
        // Both URL forms: production redirects `page.html` to the extensionless `page`, so a reload
        // or a bookmark lands on the second form.
        for (const legal of [
            'privacy-policy.html', 'privacy-policy', 'terms-and-conditions.html', 'terms-and-conditions',
        ]) {
            await page.goto(`/devocionales/${legal}?lang=en`, { waitUntil: 'domcontentloaded' });
            const icon = page.locator('svg.lucide.w-4').first();
            await expect(icon).toBeVisible();
            await expect(icon).toHaveCSS('width', '16px'); // a Tailwind rule, so the stylesheet came from cache
            await expect(page.locator('h1').first()).not.toHaveText('');
        }
    });

    test('the hero image of a devotional already read shows again with no network', async ({ page, context }) => {
        await installWorker(page);
        const hero = page.locator('#hero-image');
        await expect.poll(() => hero.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
        await expect.poll(async () => page.evaluate(async () => (await (await caches.open('devocionales-images')).keys()).length)).toBeGreaterThan(0);

        await context.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect.poll(() => page.locator('#hero-image').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    });

    test('offline, the app stats come from the saved copy and raise no error', async ({ page, context }) => {
        await installWorker(page);
        await expect.poll(async () => page.evaluate(async () => (await (await caches.open('devocionales-data')).keys()).some((r) => r.url.endsWith('/app-stats.json')))).toBe(true);
        const errors = [];
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await context.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('h1').first()).not.toHaveText('');
        await page.waitForTimeout(500);
        expect(errors.filter((text) => /AppStats/.test(text))).toEqual([]);
    });

    test('with nothing saved the reader shows its error state instead of a blank page', async ({ page, context, browserName }) => {
        test.skip(browserName === 'webkit', "Playwright's WebKit cannot intercept a service worker's own requests, so the data cache cannot be kept empty there");
        // Block the data host for the whole context: the loader retries with backoff, and those
        // retries go through the worker once it is active. page.route() cannot see the worker's own
        // network calls, so only a context-level route keeps the data cache truly empty.
        await context.route('**/Devocionales-json/**', (route) => route.abort());
        await page.goto(READER, { waitUntil: 'networkidle' });
        await page.evaluate(() => navigator.serviceWorker.ready);
        await context.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('#error-state')).toBeVisible({ timeout: 15_000 });
    });
});

test.describe('updates', () => {
    test.setTimeout(45_000);

    // Playwright cannot intercept a service worker's own script-update fetch (neither page.route
    // nor context.route sees it), so this test serves the site from a small server whose
    // /devocionales/sw.js can be switched to a "new deploy".
    test('a new worker waits for the open reader to close, so builds are never mixed, and keeps saved data', async ({ page, context }) => {
        const state = { overrides: {} };
        const server = await startSiteServer(state);
        const base = `http://127.0.0.1:${server.address().port}`;
        try {
            await installWorker(page, base);
            const source = fs.readFileSync(path.join(SITE_ROOT, 'devocionales/sw.js'), 'utf8');
            const oldVersion = source.match(/version\\":\\"([0-9a-f]{12})/)[1];
            const newVersion = 'aaaaaaaaaaaa';
            expect(await cacheNames(page)).toContain(`devocionales-${oldVersion}`);
            await page.evaluate(() => { window.readerSession = 'still-open'; });

            state.overrides['/devocionales/sw.js'] = source.replace(oldVersion, newVersion); // the deploy
            await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });

            await expect.poll(() => cacheNames(page)).toContain(`devocionales-${newVersion}`);
            // The open page still runs the old build's scripts, and the tab is visible: the new worker
            // is waiting, and neither the worker nor the page may take it over or reload the page.
            await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting))).toBe(true);
            expect(await cacheNames(page)).toContain(`devocionales-${oldVersion}`);
            expect(await page.evaluate(() => window.readerSession)).toBe('still-open');

            // Once no old page is open the new worker activates and removes the old build.
            await page.close();
            const next = await context.newPage();
            await next.goto(`${base}${READER}`, { waitUntil: 'domcontentloaded' });
            await expect.poll(() => cacheNames(next), { timeout: 15_000 }).not.toContain(`devocionales-${oldVersion}`);
            expect(await cacheNames(next)).toContain('devocionales-data');
        } finally {
            server.close();
        }
    });
});

test.describe('master switch (DevotionalPwaConfig.enabled)', () => {
    test.setTimeout(45_000);
    const DISABLED = 'window.DevotionalPwaConfig = Object.freeze({ enabled: false, installOnAndroid: false });';
    const CONFIG_PATH = '/devocionales/js/devotional-pwa-config.js';

    test('off from the start: no worker, no manifest, no install button', async ({ page, context }) => {
        await context.route(`**${CONFIG_PATH}`, (route) => route.fulfill({ contentType: 'text/javascript', body: DISABLED }));
        await page.goto(READER, { waitUntil: 'networkidle' });
        await page.evaluate(() => {
            const offer = new Event('beforeinstallprompt', { cancelable: true });
            offer.prompt = () => Promise.resolve();
            offer.userChoice = Promise.resolve({ outcome: 'accepted' });
            window.dispatchEvent(offer);
        });
        await page.waitForTimeout(500);
        expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
        expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
        await expect(page.locator('#install-app-btn')).toBeHidden();
        await expect(page.locator('h1').first()).not.toHaveText(''); // the reader itself still works
    });

    test('an online reader is switched off at once: the config is fetched fresh, with no worker update', async ({ page }) => {
        const state = { overrides: {} };
        const server = await startSiteServer(state);
        const base = `http://127.0.0.1:${server.address().port}`;
        try {
            await installWorker(page, base);
            expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);

            state.overrides[CONFIG_PATH] = DISABLED; // only the config changes: sw.js is untouched
            await page.reload({ waitUntil: 'domcontentloaded' });
            await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
            await expect.poll(async () => (await cacheNames(page)).filter((name) => name.startsWith('devocionales-')))
                .toEqual(['devocionales-disabled']);
        } finally {
            server.close();
        }
    });

    test('switched back on: the page clears the marker and a new worker installs', async ({ page }) => {
        const state = { overrides: {} };
        const server = await startSiteServer(state);
        const base = `http://127.0.0.1:${server.address().port}`;
        try {
            await installWorker(page, base);
            state.overrides[CONFIG_PATH] = DISABLED;
            await page.reload({ waitUntil: 'domcontentloaded' });
            await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);

            delete state.overrides[CONFIG_PATH]; // the real config says enabled again
            await page.reload({ waitUntil: 'domcontentloaded' });
            await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
            // The new worker installed (its build cache exists), which it refuses to do while the marker exists.
            await expect.poll(async () => (await cacheNames(page)).some((name) => /^devocionales-[0-9a-f]{12}$/.test(name)), { timeout: 15_000 }).toBe(true);
            expect(await cacheNames(page)).not.toContain('devocionales-disabled');
        } finally {
            server.close();
        }
    });

    test('one PWA module throwing does not stop the worker from registering', async ({ page, context }) => {
        // The kill switch and the registration live in start(); a broken sibling must not take it
        // down. The module loads (a precached file the worker's install also fetches) but throws.
        await context.route('**/devocionales/js/devotional-ios-hint.js', (route) => route.fulfill({
            contentType: 'text/javascript',
            body: 'window.DevotionalIosHint = { init() { throw new Error("hint exploded"); } };',
        }));
        await page.goto(READER, { waitUntil: 'networkidle' });
        await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
    });

    test('a config script that fails to load degrades to the defaults and does not break the page', async ({ page, context }) => {
        await context.route(`**${CONFIG_PATH}`, (route) => route.abort());
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.goto(READER, { waitUntil: 'networkidle' });
        await page.locator('label.theme-switch').click(); // inline code after the PWA wiring must still run
        await expect(page.locator('html')).toHaveAttribute('data-theme', /^(dark|light)$/);
        expect(pageErrors.filter((message) => /DevotionalPwaConfig/.test(message))).toEqual([]);
    });

    test('switched off by a deploy: an already installed worker and its caches are removed', async ({ page }) => {
        const state = { overrides: {} };
        const server = await startSiteServer(state);
        const base = `http://127.0.0.1:${server.address().port}`;
        try {
            await installWorker(page, base);
            const source = fs.readFileSync(path.join(SITE_ROOT, 'devocionales/sw.js'), 'utf8');
            const oldVersion = source.match(/version\\":\\"([0-9a-f]{12})/)[1];
            expect((await cacheNames(page)).some((name) => name.startsWith('devocionales-'))).toBe(true);

            // The deploy: a new worker version whose precached config says enabled: false.
            state.overrides[CONFIG_PATH] = DISABLED;
            state.overrides['/devocionales/sw.js'] = source.replace(oldVersion, 'bbbbbbbbbbbb');
            await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
            await expect.poll(() => cacheNames(page)).toContain('devocionales-bbbbbbbbbbbb');

            // The old worker still answers the reload, but it fetches the config fresh.
            await page.reload({ waitUntil: 'domcontentloaded' }); // the next visit picks up the new config
            await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
            // Only the marker that tells the unregistered worker to stand down is left behind.
            await expect.poll(async () => (await cacheNames(page)).filter((name) => name.startsWith('devocionales-')))
                .toEqual(['devocionales-disabled']);
        } finally {
            server.close();
        }
    });
});

test.describe('iOS install hint', () => {
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

    test.describe('on an iPhone', () => {
        test.use({ userAgent: IPHONE, hasTouch: true });

        test('shows a translated hint that stays dismissed once closed', async ({ page }) => {
            await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });
            const hint = page.locator('#ios-install-hint');
            await expect(hint).toBeVisible();
            await expect(hint).toContainText('Añadir a pantalla de inicio');
            await hint.locator('[data-ios-hint-close]').click();
            await expect(hint).toBeHidden();
            await page.reload({ waitUntil: 'networkidle' });
            await expect(hint).toBeHidden();
        });

        test('is not shown when the PWA is switched off', async ({ page, context }) => {
            await context.route('**/devocionales/js/devotional-pwa-config.js', (route) => route.fulfill({
                contentType: 'text/javascript',
                body: 'window.DevotionalPwaConfig = Object.freeze({ enabled: false, installOnAndroid: false });',
            }));
            await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
            await page.waitForTimeout(300);
            await expect(page.locator('#ios-install-hint')).toBeHidden();
        });
    });

    test.describe('on Android', () => {
        test.use({ userAgent: ANDROID, hasTouch: true });

        test('is not shown: the native app is the offer there', async ({ page }) => {
            await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
            await page.waitForTimeout(300);
            await expect(page.locator('#ios-install-hint')).toBeHidden();
        });
    });

    test('is not shown on a laptop', async ({ page }) => {
        await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
        await page.waitForTimeout(300);
        await expect(page.locator('#ios-install-hint')).toBeHidden();
    });
});

test.describe('install button on Android', () => {
    // Android users have the native app, so the web app is not offered there.
    test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });

    test('is never shown, while the browser\'s own install banner is still suppressed', async ({ page }) => {
        await page.goto(READER, { waitUntil: 'networkidle' });
        const notPrevented = await page.evaluate(() => {
            const offer = new Event('beforeinstallprompt', { cancelable: true });
            offer.prompt = () => Promise.resolve();
            offer.userChoice = Promise.resolve({ outcome: 'accepted' });
            return window.dispatchEvent(offer); // false when a listener called preventDefault()
        });
        expect(notPrevented).toBe(false);
        await page.waitForTimeout(300);
        await expect(page.locator('#install-app-btn')).toBeHidden();
    });
});

test.describe('install button on small phones', () => {
    // The button joins the language selector and theme switch in one header row. It must wrap
    // rather than push a control off the screen: 360px is the most common Android width, and the
    // German, Portuguese and French labels are the widest.
    for (const width of [280, 320, 360, 390]) {
        for (const lang of ['en', 'de', 'pt', 'fr', 'ar', 'hi']) {
            test(`keeps every header control on screen at ${width}px — ${lang}`, async ({ page }) => {
                await page.setViewportSize({ width, height: 800 });
                await page.goto(`/devocionales/?lang=${lang}`, { waitUntil: 'networkidle' });
                await page.evaluate(() => {
                    const offer = new Event('beforeinstallprompt', { cancelable: true });
                    offer.prompt = () => Promise.resolve();
                    offer.userChoice = Promise.resolve({ outcome: 'dismissed' });
                    window.dispatchEvent(offer);
                });
                await expect(page.locator('#install-app-btn')).toBeVisible();
                const edges = await page.evaluate(() => {
                    const rects = [...document.querySelectorAll('header *')]
                        .map((el) => el.getBoundingClientRect())
                        .filter((r) => r.width > 0);
                    return { right: Math.max(...rects.map((r) => r.right)), left: Math.min(...rects.map((r) => r.left)), viewport: window.innerWidth };
                });
                expect(edges.right).toBeLessThanOrEqual(edges.viewport + 0.5);
                expect(edges.left).toBeGreaterThanOrEqual(-0.5);
            });
        }
    }
});

test.describe('install button', () => {
    for (const [lang, label] of [['en', 'Install app'], ['es', 'Instalar app']]) {
        test(`is hidden until the browser offers installation, then shows a translated label — ${lang}`, async ({ page }) => {
            await page.goto(`/devocionales/?lang=${lang}`, { waitUntil: 'networkidle' });
            const button = page.locator('#install-app-btn');
            await expect(button).toBeHidden();

            await page.evaluate(() => {
                window.installPrompts = 0;
                const offer = new Event('beforeinstallprompt', { cancelable: true });
                offer.prompt = () => { window.installPrompts += 1; return Promise.resolve(); };
                offer.userChoice = Promise.resolve({ outcome: 'accepted' });
                window.dispatchEvent(offer);
            });
            await expect(button).toBeVisible();
            await expect(button).toContainText(label);

            await button.click();
            expect(await page.evaluate(() => window.installPrompts)).toBe(1);
            await expect(button).toBeHidden();
        });
    }
});

test.describe('Google Play download button', () => {
    const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

    test.describe('on Android', () => {
        test.use({ userAgent: ANDROID, hasTouch: true });

        test('the button and the banner are shown', async ({ page }) => {
            await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
            await expect(page.locator('#download-app-android-btn')).toBeVisible();
            await expect(page.locator('#app-banner')).toBeVisible();
        });
    });

    test.describe('on iOS', () => {
        test.use({ userAgent: IPHONE, hasTouch: true });

        test('the button and the banner stay hidden (they get the PWA)', async ({ page }) => {
            await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
            await expect(page.locator('#download-app-android-btn')).toBeHidden();
            await expect(page.locator('#app-banner')).toBeHidden();
        });
    });

    test('the button and the banner stay hidden on a laptop', async ({ page }) => {
        await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
        await expect(page.locator('#download-app-android-btn')).toBeHidden();
        await expect(page.locator('#app-banner')).toBeHidden();
    });
});

test.describe('installed app keeps the visitor inside /devocionales/', () => {
    const leavingLinks = (page) => page.locator('a[href="/"]');

    // Chromium cannot emulate display-mode, so the page is told it was launched from the home screen
    // the way iOS does it.
    async function standalone(page) {
        await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    }

    test('in a browser tab the links to the home page work', async ({ page }) => {
        await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
        await expect(page.locator('#back-link')).toBeVisible();
        const brand = page.locator('header a[href="/"]');
        expect(await brand.evaluate((el) => getComputedStyle(el).pointerEvents)).not.toBe('none');
    });

    test('in the installed app no link leads out of the scope', async ({ page }) => {
        await standalone(page);
        await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
        await expect(page.locator('#back-link')).toBeHidden();
        const brand = page.locator('header a[href="/"]');
        expect(await brand.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
        expect(await leavingLinks(page).count()).toBeGreaterThan(0); // elements stay: cached scripts still read them
    });
});

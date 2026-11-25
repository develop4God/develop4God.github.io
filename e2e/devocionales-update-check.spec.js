// Update on entry (devocionales/js/devotional-update-check.js): the page compares its build stamp
// with the build the server serves (version.json), and asks for the new worker when they differ.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

test('the served version file matches the build stamp of the page', async ({ page }) => {
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto('/devocionales/', { waitUntil: 'networkidle' });
  const result = await page.evaluate(async () => {
    const response = await fetch('/devocionales/version.json', { cache: 'no-store' });
    const body = await response.json();
    return { served: body.id, page: window.DevotionalBuild && window.DevotionalBuild.id, api: typeof window.DevotionalUpdateCheck };
  });
  expect(result.api).toBe('object');
  expect(result.served).toBeTruthy();
  expect(result.served).toBe(result.page);
  expect(consoleErrors).toEqual([]);
});

test.describe('with a service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('a page whose build is older than the server asks the browser to look for the new worker', async ({ page }) => {
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    // The server now says it runs another build than the page's stamp.
    await page.route('**/devocionales/version.json', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"id":"newer-build-id"}',
    }));
    // Counts the update requests the page makes for its worker registration.
    await page.addInitScript(() => {
      const update = ServiceWorkerRegistration.prototype.update;
      window.__swUpdateCalls = 0;
      ServiceWorkerRegistration.prototype.update = function () {
        window.__swUpdateCalls += 1;
        return update.apply(this, arguments);
      };
    });

    await page.goto('/devocionales/', { waitUntil: 'load' });
    await expect.poll(() => page.evaluate(() => window.__swUpdateCalls), { timeout: 10_000 }).toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('update banner', () => {
  test.use({ serviceWorkers: 'allow' });
  // The page's entry window (ENTRY_WINDOW_MS in devotional-sw-register.js) lets a new worker take
  // over by itself; the banner is for the reader who has been on the page longer than that.
  const PAST_ENTRY_WINDOW_MS = 9_000;

  test('a new build waiting behind a visible tab shows the banner, and one tap switches to it', async ({ page }) => {
    test.setTimeout(60_000);
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    // The reader's installed worker is an older one: the server answers the first request for it with
    // other bytes (the version stamp is kept, so it still claims the page); every later fetch, the
    // browser's update checks included, gets the real worker.
    let answered = false;
    await page.context().route('**/devocionales/sw.js', async (route) => {
      if (answered) {
        await route.continue();
        return;
      }
      answered = true;
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\n// e2e: the previous worker\n` });
    });
    await page.goto('/devocionales/', { waitUntil: 'load' });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);
    // A second tab of the app, open on another page of it.
    const otherTab = await page.context().newPage();
    await otherTab.goto('/devocionales/estudios/', { waitUntil: 'load' });
    await expect.poll(() => otherTab.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);
    await page.bringToFront();
    await page.waitForTimeout(PAST_ENTRY_WINDOW_MS);
    await expect(page.locator('.update-banner')).toHaveCount(0);

    // The browser now checks for a new worker and finds the real (different) one.
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/devocionales/')).update());

    const banner = page.locator('.update-banner');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner.locator('button')).toHaveAttribute('type', 'button');
    // The waiting build is offered in the other tab too.
    await expect(otherTab.locator('.update-banner')).toHaveCount(1, { timeout: 20_000 });
    // Installed and waiting behind the old worker: nothing took over under the visible tab.
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/devocionales/');
      return Boolean(registration.waiting) && Boolean(registration.active);
    })).toBe(true);

    await Promise.all([page.waitForEvent('load'), banner.locator('button').click()]);
    await expect.poll(() => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/devocionales/');
      return { waiting: Boolean(registration.waiting), active: registration.active && registration.active.state, banner: document.querySelectorAll('.update-banner').length };
    }), { timeout: 15_000 }).toEqual({ waiting: false, active: 'activated', banner: 0 });
    expect(consoleErrors).toEqual([]);
  });
});

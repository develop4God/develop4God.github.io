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

// The devocionales page must render fully styled, with icons and the Inter font, without any CDN.
// Self-hosting these is what lets a service worker serve the page shell offline, and it removes
// the `@latest` drift risk of the old unpkg lucide URL.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const CDN_HOSTS = ['cdn.tailwindcss.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const VENDORED = [
  '/devocionales/vendor/tailwind.css',
  '/devocionales/vendor/lucide.min.js',
  '/devocionales/vendor/fonts/inter-latin.woff2',
  '/devocionales/vendor/fonts/inter-latin-ext.woff2',
];

test('the page makes no request to a CDN host', async ({ page }) => {
  const hosts = new Set();
  page.on('request', (request) => hosts.add(new URL(request.url()).hostname));
  await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
  expect([...hosts].filter((host) => CDN_HOSTS.includes(host))).toEqual([]);
});

test('every vendored file is served', async ({ request }) => {
  for (const path of VENDORED) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect((await response.body()).length, path).toBeGreaterThan(1000);
  }
});

test.describe('with every non-local host blocked (offline-like)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route((url) => url.hostname !== '127.0.0.1', (route) => route.abort());
  });

  test('Tailwind utilities apply', async ({ page }) => {
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
    // lucide gives every icon width="24"; only the Tailwind `w-4` rule shrinks it to 16px.
    // The footer mail icon is the one `w-4` icon rendered without any data loaded (the others sit
    // in containers that are hidden until the devotional arrives).
    const icon = page.locator('svg.lucide-mail.w-4');
    await expect(icon).toBeVisible();
    await expect(icon).toHaveCSS('width', '16px');
  });

  test('lucide renders every icon', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
    expect(await page.locator('svg.lucide').count()).toBeGreaterThan(10);
    expect(await page.locator('i[data-lucide]').count()).toBe(0);
    expect(pageErrors.filter((message) => /lucide/i.test(message))).toEqual([]);
  });

  test('Inter is loaded from the vendored path', async ({ page }) => {
    const fontResponses = [];
    page.on('response', (response) => {
      if (response.url().includes('/devocionales/vendor/fonts/')) fontResponses.push(response.status());
    });
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some((face) => face.family.replace(/"/g, '') === 'Inter' && face.status === 'loaded');
    });
    expect(loaded).toBe(true);
    expect(fontResponses).toContain(200);
  });
});

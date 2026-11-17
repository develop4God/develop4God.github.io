// The Bible-studies page offline: once the worker is installed the page, its scripts and styles
// come from the build cache, and the index and every study already opened come from the data
// cache. Like devocionales-pwa.spec.js this uses the real data host once, online, so the worker
// saves what a reader would have saved.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

test.use({ serviceWorkers: 'allow' });
test.setTimeout(60_000);

const READER = '/devocionales/?lang=en';
const STUDIES = '/devocionales/estudios/?lang=en';

async function installWorker(page) {
  await page.goto(READER, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

// Visits the list and one study online; returns the id of the study that was opened.
async function visitOnline(page) {
  await page.goto(STUDIES, { waitUntil: 'networkidle' });
  const first = page.locator('.study-card').first();
  await expect(first).toBeVisible();
  const id = await first.getAttribute('data-study-id');
  await first.locator('.study-card-open').click();
  await expect(page.locator('.study-detail-title')).toBeVisible();
  // the worker saves the study file in the background once it is answered
  await expect.poll(() => page.evaluate(async () => (await (await caches.open('devocionales-data')).keys())
    .filter((request) => request.url.includes('/discovery/')).length)).toBeGreaterThan(1);
  return id;
}

test.describe('offline', () => {
  test('the studies page opens with its list and styles with no network', async ({ page, context }) => {
    await installWorker(page);
    await visitOnline(page);
    await context.setOffline(true);
    await page.goto(STUDIES, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.study-card').first()).toBeVisible();
    await expect(page.locator('#studies-title')).toHaveText('Bible Studies');
    await expect(page.locator('.study-chip').first()).toHaveCSS('border-radius', /.+/); // discovery.css came from the cache
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.study-grid')).display)).toBe('grid');
  });

  test('a study already opened opens again through its deep link with no network', async ({ page, context }) => {
    await installWorker(page);
    const id = await visitOnline(page);
    await context.setOffline(true);
    await page.goto(`${STUDIES}&id=${id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.study-detail-title')).toBeVisible();
    await expect(page.locator('.study-keyverse-text')).not.toHaveText('');
  });

  test('the slashless URL the host redirects from also opens offline', async ({ page, context }) => {
    await installWorker(page);
    await visitOnline(page);
    await context.setOffline(true);
    await page.goto('/devocionales/estudios?lang=en', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.study-card').first()).toBeVisible();
  });

  test('a study never opened offers Retry instead of an empty page, and Retry works once back online', async ({ page, context }) => {
    await installWorker(page);
    const opened = await visitOnline(page);
    await context.setOffline(true);
    await page.goto(STUDIES, { waitUntil: 'domcontentloaded' });
    const other = await page.locator('.study-card').nth(1).getAttribute('data-study-id');
    expect(other).not.toBe(opened);
    await page.locator('.study-card').nth(1).locator('.study-card-open').click();
    await expect(page.locator('.study-message[role="alert"]')).toBeVisible();
    await context.setOffline(false);
    await page.locator('.study-retry').click();
    await expect(page.locator('.study-detail-title')).toBeVisible();
  });

  test('the Studies link in the reader header works offline too', async ({ page, context }) => {
    await installWorker(page);
    await visitOnline(page);
    await context.setOffline(true);
    await page.goto(READER, { waitUntil: 'domcontentloaded' });
    await page.locator('#nav-studies-label').click();
    await expect(page).toHaveURL(/\/devocionales\/estudios\//);
    await expect(page.locator('.study-card').first()).toBeVisible();
  });
});

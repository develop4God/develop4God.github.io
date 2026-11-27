// The browser-tab header: Studies and Encounters next to Today's Devotional (the installed app has the bottom bar
// instead). The header's layout contract (two rows, nothing wraps or clips) is in devocionales-header-layout.spec.js.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

// ---- the browser-tab header: Studies next to Today's Devotional (the installed app has the bottom bar instead) ----

const STUDY_DATA = /raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/discovery\//;
const mockStudies = (page) => page.route(STUDY_DATA, (route) => route.fulfill({
  json: { studies: [{ id: 's1', version: '1', emoji: '🧎', files: { en: 's1_en.json', es: 's1_es.json' }, titles: { en: 'T', es: 'T' }, subtitles: {}, estimated_reading_minutes: { en: 5, es: 5 } }] },
}));

test.describe('web header: Studies tab next to Today\'s Devotional', () => {
  test('the reader header shows the links; Today\'s Devotional is active and Studies opens the studies page', async ({ page }) => {
    await mockStudies(page);
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
    const links = page.locator('header nav a');
    await expect(links).toHaveCount(3); // devotional, studies, encounters
    await expect(links.nth(2)).toHaveAttribute('href', '/devocionales/encounters/');
    await expect(links.nth(0)).toHaveClass(/active/);
    await expect(links.nth(1).locator('[data-i18n="shell.studies"]')).toHaveText('Bible Studies');
    await expect(links.nth(1)).toHaveAttribute('href', '/devocionales/estudios/');
    await links.nth(1).click();
    await expect(page).toHaveURL(/\/devocionales\/estudios\//);
    await expect(page.locator('.study-card').first()).toBeVisible();
  });

  test('the studies page header has the same links with Studies active, and the first one leads back', async ({ page }) => {
    await mockStudies(page);
    await page.goto('/devocionales/estudios/?lang=en', { waitUntil: 'networkidle' });
    const links = page.locator('#studies-nav a');
    await expect(links).toHaveCount(3);
    await expect(links.nth(2)).toHaveAttribute('href', '/devocionales/encounters/');
    await expect(links.nth(0)).toHaveText('Today\'s Devotional');
    await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
    await links.nth(0).click();
    await expect(page).toHaveURL(/\/devocionales\/(\?|$)/);
    await expect(page.locator('#devotional-verse-ref')).not.toHaveText('');
  });

  test('both links are translated (Spanish) on both pages', async ({ page }) => {
    await mockStudies(page);
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });
    await expect(page.locator('#nav-studies-label [data-i18n="shell.studies"]')).toHaveText('Estudios Bíblicos');
    await page.goto('/devocionales/estudios/?lang=es', { waitUntil: 'networkidle' });
    await expect(page.locator('#studies-nav a').nth(1)).toHaveText('Estudios Bíblicos');
    await expect(page.locator('#studies-nav a').nth(0)).not.toHaveText('');
  });

  test('a phone keeps the header inside the screen on both pages', async ({ page }) => {
    await mockStudies(page);
    await page.setViewportSize({ width: 320, height: 568 });
    for (const url of ['/devocionales/?lang=de', '/devocionales/estudios/?lang=de']) {
      await page.goto(url, { waitUntil: 'networkidle' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), url).toBe(false);
    }
  });

  test('installed app: the header links give way to the bottom bar (no duplicate Studies entry)', async ({ page }) => {
    await mockStudies(page);
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveClass(/shell-active/);
    await expect(page.locator('#nav-studies-item')).toBeHidden();
    await expect(page.locator('[data-shell-tab="studies"]')).toBeVisible();
    await page.goto('/devocionales/estudios/?lang=en', { waitUntil: 'networkidle' });
    await expect(page.locator('#studies-nav')).toBeHidden();
    await expect(page.locator('[data-shell-tab="studies"]')).toBeVisible();
  });
});

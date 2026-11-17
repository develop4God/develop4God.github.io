// The header's action row (install button, language selector, ...) wraps and centres only when it
// is narrower than the page needs; from the md breakpoint up, and in right-to-left languages, its
// layout is the plain one-row flex it had before the install button was added.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const ACTIONS = '#language-selector';

async function actionRow(page) {
  return page.locator(ACTIONS).evaluate((selector) => {
    const style = getComputedStyle(selector.parentElement);
    return { flexWrap: style.flexWrap, justifyContent: style.justifyContent, direction: style.direction };
  });
}

for (const [label, width] of [['desktop', 1280], ['tablet', 768]]) {
  for (const lang of ['en', 'ar']) {
    test(`header actions: ${label} ${lang} keeps one unwrapped row with its original alignment`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/devocionales/?lang=${lang}`, { waitUntil: 'networkidle' });
      const row = await actionRow(page);
      expect(row.flexWrap).toBe('nowrap');
      expect(row.justifyContent).toBe('normal'); // what it computed before the install button
      if (lang === 'ar') expect(row.direction).toBe('rtl');
    });
  }
}

test('header actions: a phone may wrap and centres the row', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
  const row = await actionRow(page);
  expect(row.flexWrap).toBe('wrap');
  expect(row.justifyContent).toBe('center');
  expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBe(false);
});

// ---- the browser-tab header: Studies next to Today's Devotional (the installed app has the bottom bar instead) ----

const STUDY_DATA = /raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/discovery\//;
const mockStudies = (page) => page.route(STUDY_DATA, (route) => route.fulfill({
  json: { studies: [{ id: 's1', version: '1', emoji: '🧎', files: { en: 's1_en.json', es: 's1_es.json' }, titles: { en: 'T', es: 'T' }, subtitles: {}, estimated_reading_minutes: { en: 5, es: 5 } }] },
}));

test.describe('web header: Studies tab next to Today\'s Devotional', () => {
  test('the reader header shows both links; Today\'s Devotional is active and Studies opens the studies page', async ({ page }) => {
    await mockStudies(page);
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
    const links = page.locator('header nav a');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveClass(/active/);
    await expect(links.nth(1)).toHaveText('Bible Studies');
    await expect(links.nth(1)).toHaveAttribute('href', '/devocionales/estudios/');
    await links.nth(1).click();
    await expect(page).toHaveURL(/\/devocionales\/estudios\//);
    await expect(page.locator('.study-card').first()).toBeVisible();
  });

  test('the studies page header has the same two links with Studies active, and the first one leads back', async ({ page }) => {
    await mockStudies(page);
    await page.goto('/devocionales/estudios/?lang=en', { waitUntil: 'networkidle' });
    const links = page.locator('#studies-nav a');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText('Today\'s Devotional');
    await expect(links.nth(1)).toHaveAttribute('aria-current', 'page');
    await links.nth(0).click();
    await expect(page).toHaveURL(/\/devocionales\/(\?|$)/);
    await expect(page.locator('#devotional-verse-ref')).not.toHaveText('');
  });

  test('both links are translated (Spanish) on both pages', async ({ page }) => {
    await mockStudies(page);
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });
    await expect(page.locator('#nav-studies-label')).toHaveText('Estudios Bíblicos');
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

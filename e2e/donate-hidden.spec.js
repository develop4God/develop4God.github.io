const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

// The habitus donate section is still hidden. The devocionales header Donate button is shown only in the
// languages the Apóyanos page is translated into (all 10 of the reader's) and leads there; the unit test
// devotional-support-link.test.js covers hiding it in a language without a translation.
test.describe('donate / support options', () => {
  test.setTimeout(45_000);
  // One test, languages in sequence: ten parallel reader loads starve each other on a small CI runner.
  test('the devocionales header donate button is shown and links to the Apóyanos page in all 10 languages', async ({ page }) => {
    test.setTimeout(240_000);
    for (const lang of ['es', 'en', 'pt', 'fr', 'de', 'ja', 'zh', 'hi', 'ar', 'fil']) {
      await page.goto(`/devocionales/?lang=${lang}`, { waitUntil: 'domcontentloaded' });
      const button = page.locator('#support-ministry-btn');
      await expect(button, lang).toBeVisible({ timeout: 25_000 });
      await expect(button, lang).toHaveAttribute('href', '/apoyanos/');
    }
  });

  test('the devocionales header donate button opens the Apóyanos page', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });
    await page.locator('#support-ministry-btn').click();
    await expect(page).toHaveURL(/\/apoyanos\/$/);
  });

  test('habitus has no visible PayPal link and the support section is hidden', async ({ page }) => {
    await page.goto('/habitus/', { waitUntil: 'networkidle' });
    await expect(page.locator('#donacion')).toBeHidden();
    await expect(page.locator('a[href*="paypal.com"]:visible')).toHaveCount(0);
  });
});

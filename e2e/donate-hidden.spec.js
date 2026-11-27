const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

// The habitus donate section is still hidden. The devocionales header Donate button is shown in every language and leads to Apóyanos.
test.describe('donate / support options', () => {
  for (const lang of ['es', 'en']) {
    test(`devocionales header donate button in ${lang} opens the Apóyanos page`, async ({ page }) => {
      await page.goto(`/devocionales/?lang=${lang}`, { waitUntil: 'networkidle' });
      const button = page.locator('#support-ministry-btn');
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('href', '/apoyanos/');
      await button.click();
      await expect(page).toHaveURL(/\/apoyanos\/$/);
    });
  }

  // The Apóyanos page ships in all 10 languages, so the header Donate button is shown in every one of them.
  for (const lang of ['es', 'en', 'pt', 'fr', 'de', 'ja', 'zh', 'hi', 'ar', 'fil']) {
    test(`devocionales header donate button in ${lang} is shown and links to Apóyanos`, async ({ page }) => {
      await page.goto(`/devocionales/?lang=${lang}`, { waitUntil: 'networkidle' });
      const button = page.locator('#support-ministry-btn');
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('href', '/apoyanos/');
    });
  }

  test('habitus has no visible PayPal link and the support section is hidden', async ({ page }) => {
    await page.goto('/habitus/', { waitUntil: 'networkidle' });
    await expect(page.locator('#donacion')).toBeHidden();
    await expect(page.locator('a[href*="paypal.com"]:visible')).toHaveCount(0);
  });
});

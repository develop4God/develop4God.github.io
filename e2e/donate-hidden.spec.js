const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

// The habitus donate section is still hidden. The devocionales header Donate button is shown only in the
// languages the Apóyanos page is translated into (es, en) and leads there.
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

  test('devocionales header donate button stays hidden in a language without an Apóyanos translation', async ({ page }) => {
    await page.goto('/devocionales/?lang=fr', { waitUntil: 'networkidle' });
    await expect(page.locator('#support-ministry-btn')).toBeHidden();
  });

  test('habitus has no visible PayPal link and the support section is hidden', async ({ page }) => {
    await page.goto('/habitus/', { waitUntil: 'networkidle' });
    await expect(page.locator('#donacion')).toBeHidden();
    await expect(page.locator('a[href*="paypal.com"]:visible')).toHaveCount(0);
  });
});

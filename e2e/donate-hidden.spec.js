const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

// Donate / support options are hidden for now (class "hidden" in the markup).
// Remove this spec when they are re-enabled.
test.describe('donate / support options are hidden', () => {
  test('devocionales header donate button is not visible', async ({ page }) => {
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
    await expect(page.locator('#support-ministry-btn')).toBeHidden();
  });

  test('habitus has no visible PayPal link and the support section is hidden', async ({ page }) => {
    await page.goto('/habitus/', { waitUntil: 'networkidle' });
    await expect(page.locator('#donacion')).toBeHidden();
    await expect(page.locator('a[href*="paypal.com"]:visible')).toHaveCount(0);
  });
});

// Every public page declares itself canonical on the production domain. A page that points at
// another host (e.g. the github.io mirror) sends search engines conflicting signals.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const ORIGIN = 'https://develop4god.com';
const PAGES = [
  '/',
  '/devocionales/',
  '/habitus/',
  '/work-with-me/',
  '/devocionales/privacy-policy.html',
  '/devocionales/terms-and-conditions.html',
];

for (const path of PAGES) {
  test(`canonical of ${path} is on ${ORIGIN} and matches its own path`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', ORIGIN + path);
  });
}

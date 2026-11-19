// Every public page declares itself canonical on the production domain, at the URL that actually
// answers 200 there. A canonical on another host (the github.io mirror) or on a URL that redirects
// sends search engines conflicting signals.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const ORIGIN = 'https://develop4god.com';
// [file path served locally, canonical path]. Cloudflare Pages redirects `*.html` to the
// extensionless URL (308), so the legal pages are canonical at the extensionless URL.
const PAGES = [
  ['/', '/'],
  ['/devocionales/', '/devocionales/'],
  ['/habitus/', '/habitus/'],
  ['/work-with-me/', '/work-with-me/'],
  ['/devocionales/privacy-policy.html', '/devocionales/privacy-policy'],
  ['/devocionales/terms-and-conditions.html', '/devocionales/terms-and-conditions'],
  ['/habitus/politica-de-privacidad.html', '/habitus/politica-de-privacidad'],
  ['/habitus/terminos-y-condiciones.html', '/habitus/terminos-y-condiciones'],
];

for (const [served, canonical] of PAGES) {
  test(`canonical of ${served} is ${ORIGIN}${canonical}`, async ({ page }) => {
    await page.goto(served, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', ORIGIN + canonical);
  });
}

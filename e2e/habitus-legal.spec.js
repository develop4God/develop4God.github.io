// The Habitus+Faith legal pages (privacy policy, terms and conditions): rendered from the live
// translations in two languages at phone and desktop widths, with a working way back to /habitus/.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const PAGES = [
  { path: '/habitus/politica-de-privacidad.html', kind: 'privacy' },
  { path: '/habitus/terminos-y-condiciones.html', kind: 'terms' },
];
const LANGS = {
  es: { privacy: 'Política de Privacidad de la Aplicación', terms: 'Términos y Condiciones de Uso de la Aplicación' },
  en: { privacy: 'Privacy Policy for the', terms: 'Terms and Conditions of Use for the' },
};
const VIEWPORTS = { phone: { width: 375, height: 667 }, desktop: { width: 1280, height: 800 } };

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

for (const { path, kind } of PAGES) {
  for (const [lang, titles] of Object.entries(LANGS)) {
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
      test(`${kind} page in ${lang} at ${vpName}: renders the Habitus+Faith text, no overflow, no console errors`, async ({ page }) => {
        const errors = trackErrors(page);
        await page.addInitScript((l) => localStorage.setItem('develop4God_language', l), lang);
        await page.setViewportSize(viewport);
        await page.goto(path, { waitUntil: 'networkidle' });

        await expect(page.locator('h1')).toContainText(titles[kind]);
        await expect(page.locator('h1')).toContainText('Habitus+Faith');
        await expect(page.locator('#legal-content h2').first()).toBeVisible();
        expect(await page.locator('#legal-content h2').count()).toBeGreaterThanOrEqual(kind === 'terms' ? 10 : 7);
        await expect(page.locator('body')).not.toContainText(/Devocionales Cristianos|Christian Devotionals/);
        await expect(page).toHaveTitle(new RegExp(titles[kind]));
        expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBe(false);
        expect(errors).toEqual([]);
      });
    }
  }

  test(`${kind} page: the back link returns to /habitus/`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.locator('header a[href="/habitus/"]').click();
    await expect(page).toHaveURL(/\/habitus\/$/);
    await expect(page.locator('h1').first()).not.toHaveText('');
    expect(errors).toEqual([]);
  });

  test(`${kind} page: switching language re-renders the body`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('develop4God_language', 'es'));
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.locator('.language-selector-button').click();
    await page.locator('.language-option[data-lang="en"]').click();
    await expect(page.locator('h1')).toContainText(LANGS.en[kind]);
    expect(await page.locator('#legal-content h2').first().textContent()).toMatch(/^1\. /);
    await expect(page.locator('#legal-content h2').first()).not.toContainText('Información');
  });
}

test('landing page footer links open both legal pages', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('develop4God_language', 'en'));
  await page.goto('/habitus/', { waitUntil: 'networkidle' });
  await expect(page.locator('footer a[href="/habitus/politica-de-privacidad"]')).toHaveText('Privacy Policy');
  await expect(page.locator('footer a[href="/habitus/terminos-y-condiciones"]')).toHaveText('Terms and Conditions');
});

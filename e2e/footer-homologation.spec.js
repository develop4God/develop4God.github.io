// Verifies the site-wide footer homologation: every page (root, habitus,
// work-with-me, devocionales index + legal pages) renders the same
// SiteFooter-driven copyright/made-with text, in multiple languages and at
// multiple viewport sizes, with zero console errors.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const VIEWPORTS = {
  phone: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
};

async function readFooterLines(page) {
  const copyright = await page.locator('[data-site-footer-line="copyright"]').textContent();
  const madeWith = await page.locator('[data-site-footer-line="madeWith"]').textContent();
  return { copyright, madeWith };
}

async function switchLanguageViaDropdown(page, lang) {
  await page.locator('.language-selector-button').click();
  await page.locator(`.language-option[data-lang="${lang}"]`).click();
}

const DROPDOWN_PAGES = [
  { name: 'root', path: '/' },
  { name: 'habitus', path: '/habitus/' },
  { name: 'work-with-me', path: '/work-with-me/' },
];

for (const { name, path } of DROPDOWN_PAGES) {
  for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
    test(`${name} footer shows canonical made-with text at ${viewportName} (en)`, async ({ page }) => {
      const consoleErrors = [];
      page.on('pageerror', (e) => consoleErrors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

      await page.setViewportSize(size);
      await page.goto(path, { waitUntil: 'networkidle' });
      await switchLanguageViaDropdown(page, 'en');
      await page.waitForTimeout(200);

      const { copyright, madeWith } = await readFooterLines(page);
      expect(copyright).toContain('Develop4God');
      expect(madeWith).toBe('Made with ♥️ by develop4God');
      expect(consoleErrors).toEqual([]);
    });
  }

  test(`${name} footer updates made-with text on language switch (en -> es)`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'networkidle' });
    await switchLanguageViaDropdown(page, 'en');
    await page.waitForTimeout(200);
    const enText = (await readFooterLines(page)).madeWith;
    expect(enText).toBe('Made with ♥️ by develop4God');

    await switchLanguageViaDropdown(page, 'es');
    await page.waitForTimeout(200);
    const esText = (await readFooterLines(page)).madeWith;
    expect(esText).toBe('Desarrollado con ♥️ por develop4God');
  });
}

const QUERY_PARAM_PAGES = [
  { name: 'devocionales index', path: '/devocionales/' },
  { name: 'devocionales privacy-policy', path: '/devocionales/privacy-policy.html' },
  { name: 'devocionales terms-and-conditions', path: '/devocionales/terms-and-conditions.html' },
];

for (const { name, path } of QUERY_PARAM_PAGES) {
  for (const lang of ['en', 'es', 'fr']) {
    test(`${name} footer shows canonical made-with text (${lang})`, async ({ page }) => {
      const consoleErrors = [];
      page.on('pageerror', (e) => consoleErrors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

      await page.goto(`${path}?lang=${lang}`, { waitUntil: 'networkidle' });

      const { copyright, madeWith } = await readFooterLines(page);
      expect(copyright).toContain('Develop4God');
      const expected = {
        en: 'Made with ♥️ by develop4God',
        es: 'Desarrollado con ♥️ por develop4God',
        fr: 'Développé avec ♥️ par develop4God',
      }[lang];
      expect(madeWith).toBe(expected);
      expect(consoleErrors).toEqual([]);
    });
  }

  for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
    test(`${name} footer has no horizontal overflow at ${viewportName}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(`${path}?lang=en`, { waitUntil: 'networkidle' });
      const hasOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
      expect(hasOverflow).toBe(false);
    });
  }
}

test('all pages use the same contact-link icon+label structure', async ({ page }) => {
  const pages = ['/', '/habitus/', '/work-with-me/', '/devocionales/'];
  for (const path of pages) {
    await page.goto(path, { waitUntil: 'networkidle' });
    const contactLink = page.locator('#page-footer a[href^="mailto:"]').first();
    await expect(contactLink).toBeVisible();
    const icon = contactLink.locator('svg, i[data-lucide]');
    await expect(icon).toHaveCount(1);
  }
});

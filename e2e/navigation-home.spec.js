// Navigation between the terminal root page and the section pages, on a phone
// and a desktop profile: section -> home via the header brand, root -> section
// -> home round trip, and browser back/forward.
const { test, expect, devices } = require('/tmp/pw-tools/node_modules/@playwright/test');

// Chromium is the only installed browser, so drop the descriptor's own browser type.
function chromiumProfile(name) {
  const profile = { ...devices[name] };
  delete profile.defaultBrowserType;
  return profile;
}
const PROFILES = { phone: chromiumProfile('Pixel 7'), desktop: chromiumProfile('Desktop Chrome') };

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function expectTerminalRoot(page) {
  await expect(page).toHaveURL(/\/(\?.*)?(#.*)?$/);
  await expect(page.locator('#story-hero')).toBeVisible();
  await expect(page.locator('a.brand.wm')).toBeVisible();
}

for (const [name, profile] of Object.entries(PROFILES)) {
  test.describe(name, () => {
    test.use(profile);

    for (const section of ['/devocionales/', '/habitus/', '/work-with-me/']) {
      test(`${section} -> header brand returns to the terminal root`, async ({ page }) => {
        const errors = trackErrors(page);
        await page.goto(section, { waitUntil: 'networkidle' });
        await page.locator('header.site-nav a[href="/"]').first().click();
        await page.waitForLoadState('networkidle');
        await expectTerminalRoot(page);
        expect(errors).toEqual([]);
      });
    }

    test('root -> devocionales -> home -> back -> forward is handled', async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto('/#ministry', { waitUntil: 'networkidle' });
      await page.locator('a.btn.m[href="/devocionales/"]').click();
      await expect(page).toHaveURL(/\/devocionales\/$/);
      await page.waitForLoadState('networkidle');
      await page.locator('header.site-nav a[href="/"]').first().click();
      await expectTerminalRoot(page);
      await page.goBack();
      await expect(page).toHaveURL(/\/devocionales\/$/);
      await page.goForward();
      await expectTerminalRoot(page);
      expect(errors).toEqual([]);
    });

    test('root -> habitus -> home round trip', async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto('/#ministry', { waitUntil: 'networkidle' });
      await page.locator('a.btn.m[href="/habitus/"]').click();
      await expect(page).toHaveURL(/\/habitus\/$/);
      await page.waitForLoadState('networkidle');
      await page.locator('header.site-nav a[href="/"]').first().click();
      await expectTerminalRoot(page);
      expect(errors).toEqual([]);
    });

    test('no section page links to the old home-only #our-vision anchor', async ({ page }) => {
      for (const section of ['/devocionales/', '/habitus/', '/work-with-me/']) {
        await page.goto(section, { waitUntil: 'networkidle' });
        await expect(page.locator('a[href$="#our-vision"]')).toHaveCount(0);
      }
    });
  });
}

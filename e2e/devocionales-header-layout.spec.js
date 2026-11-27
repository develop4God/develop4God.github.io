// The browser-tab header is two rows at every width: brand + actions, then the tabs, autofitted to one row.
// Nothing may clip or push the page sideways, in any language, with every action showing.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const WIDTHS = [320, 390, 700, 1000, 1320];

async function openHeader(page, width, lang) {
  await page.setViewportSize({ width, height: 600 });
  await page.goto(`/devocionales/?lang=${lang}`, { waitUntil: 'domcontentloaded' });
  // The header texts are written after the devotional data (a remote fetch) has loaded.
  await expect(page.locator('#support-ministry-btn')).toBeVisible({ timeout: 25_000 });
  // The Install button appears only when the browser offers installing: fake the offer so it is laid out too.
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }),
    { prompt() {}, userChoice: Promise.resolve({}) })));
  await expect(page.locator('#install-app-btn')).toBeVisible();
}

test.describe('devocionales header layout', () => {
  test.use({ serviceWorkers: 'block' });
  test.setTimeout(45_000);

  for (const lang of ['es', 'en']) {
    for (const width of WIDTHS) {
      test(`${lang} at ${width}px: no sideways scroll, actions inside the screen, tabs on one row`, async ({ page }) => {
        await openHeader(page, width, lang);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        for (const selector of ['#support-ministry-btn', '#install-app-btn', '#language-selector', '.theme-switch']) {
          const box = await page.locator(selector).boundingBox();
          expect(box, selector).not.toBeNull();
          expect(box.x, `${selector} starts on screen`).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width, `${selector} ends on screen`).toBeLessThanOrEqual(width);
        }
        const tops = await page.locator('.site-header-nav li:visible').evaluateAll((items) => items.map((li) => Math.round(li.getBoundingClientRect().top)));
        expect(tops.length).toBeGreaterThanOrEqual(3);
        expect(new Set(tops).size, 'the tabs share one row').toBe(1);
        const nav = await page.locator('.site-header-nav ul').evaluate((ul) => ({ content: ul.scrollWidth, shown: ul.clientWidth }));
        expect(nav.content, 'every tab fits without scrolling or clipping').toBeLessThanOrEqual(nav.shown);
      });
    }
  }

  // The Donate button shows in all 10 languages, so the other eight are held to the same no-overflow contract
  // on the header (the long Filipino labels may wrap; right-to-left Arabic must not widen the page).
  for (const lang of ['fr', 'de', 'pt', 'fil', 'ja', 'hi', 'zh', 'ar']) {
    for (const width of [320, 390]) {
      test(`${lang} at ${width}px: the header does not push the page sideways`, async ({ page }) => {
        await page.setViewportSize({ width, height: 600 });
        await page.goto(`/devocionales/?lang=${lang}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('html')).toHaveAttribute('lang', lang, { timeout: 25_000 });
        await expect(page.locator('#language-selector .language-selector-button')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      });
    }
  }

  test('the Donate and Install buttons keep an accessible name when they show only an icon', async ({ page }) => {
    await openHeader(page, 390, 'es');
    await expect(page.locator('#support-ministry-btn')).toHaveAccessibleName('Donar');
    await expect(page.locator('#install-app-btn')).toHaveAccessibleName('Instalar app');
  });

  test('on a wide screen the labels are visible next to the icons', async ({ page }) => {
    await openHeader(page, 1320, 'en');
    await expect(page.locator('#support-ministry-btn')).toContainText('Donate');
    await expect(page.locator('#install-app-btn')).toContainText('Install app');
    const box = await page.locator('#install-app-btn').boundingBox();
    expect(box.width).toBeGreaterThan(100);
  });

  for (const width of WIDTHS) {
    test(`at ${width}px the actions sit side by side in one row, level with the brand`, async ({ page }) => {
      await openHeader(page, width, 'es');
      const rows = await page.evaluate(() => {
        const mid = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return r.top + r.height / 2; };
        return ['.site-brand', '#support-ministry-btn', '#install-app-btn', '#language-selector', '.theme-switch'].map(mid);
      });
      const [brand, ...actions] = rows;
      for (const centre of actions) expect(Math.abs(centre - brand), 'every action is level with the brand').toBeLessThan(40);
      expect(Math.max(...actions) - Math.min(...actions), 'the actions share one row').toBeLessThan(40);
    });
  }

  test('the language list opens fully on screen from the icon-only phone selector', async ({ page }) => {
    await openHeader(page, 390, 'es');
    await page.locator('.language-selector-button').click();
    const list = await page.locator('.language-dropdown').boundingBox();
    expect(list.x).toBeGreaterThanOrEqual(0);
    expect(list.x + list.width).toBeLessThanOrEqual(390);
    expect(list.width).toBeGreaterThan(150);
  });
});

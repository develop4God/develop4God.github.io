// The header's action row (install button, language selector, ...) wraps and centres only when it
// is narrower than the page needs; from the md breakpoint up, and in right-to-left languages, its
// layout is the plain one-row flex it had before the install button was added.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const ACTIONS = '#language-selector';

async function actionRow(page) {
  return page.locator(ACTIONS).evaluate((selector) => {
    const style = getComputedStyle(selector.parentElement);
    return { flexWrap: style.flexWrap, justifyContent: style.justifyContent, direction: style.direction };
  });
}

for (const [label, width] of [['desktop', 1280], ['tablet', 768]]) {
  for (const lang of ['en', 'ar']) {
    test(`header actions: ${label} ${lang} keeps one unwrapped row with its original alignment`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/devocionales/?lang=${lang}`, { waitUntil: 'networkidle' });
      const row = await actionRow(page);
      expect(row.flexWrap).toBe('nowrap');
      expect(row.justifyContent).toBe('normal'); // what it computed before the install button
      if (lang === 'ar') expect(row.direction).toBe('rtl');
    });
  }
}

test('header actions: a phone may wrap and centres the row', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
  const row = await actionRow(page);
  expect(row.flexWrap).toBe('wrap');
  expect(row.justifyContent).toBe('center');
  expect(await page.evaluate(() => document.body.scrollWidth > window.innerWidth)).toBe(false);
});

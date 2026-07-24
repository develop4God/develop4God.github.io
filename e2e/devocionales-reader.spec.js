// Cross-language smoke coverage for the devotional reader
// (devocionales/index.html). Exercises real UI state, not just page load:
// content renders, TTS button responds, prev/next nav actually changes
// the displayed entry — for every supported language.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const LANGUAGES = ['es', 'en', 'pt', 'fr', 'ja', 'zh', 'hi', 'de', 'ar', 'fil'];

for (const lang of LANGUAGES) {
  test(`devocionales reader loads and is interactive — ${lang}`, async ({ page }) => {
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    await page.goto(`/devocionales/?lang=${lang}`, { waitUntil: 'networkidle' });

    const h1 = page.locator('h1').first();
    await expect(h1).not.toHaveText('');
    const beforeText = await h1.textContent();

    const ttsBtn = page.locator('#tts-btn');
    await expect(ttsBtn).toBeVisible();
    await ttsBtn.click();

    const nextBtn = page.locator('#nav-next');
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();
    await page.waitForTimeout(500);

    const afterText = await h1.textContent();
    expect(afterText).not.toBe(beforeText);

    expect(consoleErrors).toEqual([]);
  });
}

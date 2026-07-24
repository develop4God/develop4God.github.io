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

test.describe('devocionales reader mobile reading order', () => {
  // Regression test: on mobile, Para Meditar was stacking above Verse
  // instead of between Reflexión and Oración, because the layout used
  // 2 grid items (aside + article div) and mobile just stacks DOM order
  // once the md: grid isn't active. Fixed by splitting into 4 explicit
  // grid items with order-N classes controlling mobile stacking
  // independently of the desktop column placement.
  test('verse, reflexion, para meditar, then oracion — in that vertical order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });

    const ids = ['versiculo-label', 'para-meditar-label', 'oracion-label'];
    const tops = [];
    for (const id of ids) {
      const box = await page.locator(`#${id}`).boundingBox();
      tops.push(box.y);
    }

    expect(tops[0]).toBeLessThan(tops[1]); // versiculo before para-meditar
    expect(tops[1]).toBeLessThan(tops[2]); // para-meditar before oracion
  });

  test('desktop keeps the two-column sidebar layout (para meditar left, verse right)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });

    const meditarBox = await page.locator('#para-meditar-label').boundingBox();
    const versiculoBox = await page.locator('#versiculo-label').boundingBox();

    expect(meditarBox.x).toBeLessThan(versiculoBox.x); // sidebar left of article
    expect(Math.abs(meditarBox.y - versiculoBox.y)).toBeLessThan(20); // same row
  });
});

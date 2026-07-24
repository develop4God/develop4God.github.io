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

test.describe('devocionales reader share feature', () => {
  // Issue #12: replaced hardcoded Facebook/X-only share links (no social
  // presence to point them at) with navigator.share() + a mailto fallback.

  test('mailto fallback link includes the verse text and page URL', async ({ page }) => {
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });

    const mailHref = await page.locator('#share-mail').getAttribute('href');
    const pageUrl = page.url();
    expect(mailHref).toMatch(/^mailto:\?subject=/);
    expect(mailHref).toContain(encodeURIComponent(pageUrl));
  });

  test('native share button calls navigator.share with current entry data when supported', async ({ page }) => {
    await page.addInitScript(() => {
      window.__shareCalls = [];
      Object.defineProperty(navigator, 'share', {
        value: (data) => {
          window.__shareCalls.push(data);
          return Promise.resolve();
        },
        configurable: true,
      });
    });

    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });

    const nativeBtn = page.locator('#share-native');
    await expect(nativeBtn).toBeVisible();
    await nativeBtn.click();

    const calls = await page.evaluate(() => window.__shareCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(page.url());
    expect(calls[0].text.length).toBeGreaterThan(0);

    // Clicking again after this should still fire exactly once more — not
    // stack additional listeners across the module-level shareHandlerBound
    // guard (regression coverage for the setupTts stacked-listener bug
    // class, applied here to renderShareLinks).
    await nativeBtn.click();
    const callsAfterSecondClick = await page.evaluate(() => window.__shareCalls);
    expect(callsAfterSecondClick).toHaveLength(2);
  });

  test('native share button is hidden when navigator.share is unsupported', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });

    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });

    await expect(page.locator('#share-native')).toBeHidden();
    await expect(page.locator('#share-mail')).toBeVisible();
  });
});

test.describe('devocionales reader salvation prayer modal', () => {
  // Web equivalent of the Flutter app's SalvationPrayerDialog: shown after
  // advancing to a new devotional via "next", unless previously dismissed
  // with "don't show again" (persisted in localStorage).

  test('appears after clicking next, with translated content, and can be dismissed', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    const modal = page.locator('#salvation-prayer-modal');
    await expect(modal).toBeHidden();

    await page.click('#nav-next');
    await expect(modal).toBeVisible();
    await expect(page.locator('#salvation-modal-title')).not.toHaveText('');
    await expect(page.locator('#salvation-modal-prayer')).not.toHaveText('');
    await expect(page.locator('#salvation-modal-continue')).not.toHaveText('');

    await page.click('#salvation-modal-continue');
    await expect(modal).toBeHidden();
  });

  test('does not appear on prev navigation', async ({ page }) => {
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });

    await page.click('#nav-prev');
    await page.waitForTimeout(300);
    await expect(page.locator('#salvation-prayer-modal')).toBeHidden();
  });

  test('"don\'t show again" persists across subsequent next clicks', async ({ page }) => {
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });

    const modal = page.locator('#salvation-prayer-modal');
    await page.click('#nav-next');
    await expect(modal).toBeVisible();

    await page.check('#salvation-modal-dont-show');
    await page.click('#salvation-modal-continue');
    await expect(modal).toBeHidden();

    await page.click('#nav-next');
    await page.waitForTimeout(300);
    await expect(modal).toBeHidden();
  });
});

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

  test('footer contact link is a static contact-us mailto, separate from the share row', async ({ page }) => {
    // Regression: mail used to live inside the share row and rebuild its body
    // from the WhatsApp-formatted share text (emoji + *bold* markdown),
    // producing a corrupted email body. Native share already covers "share
    // via email" — contact is now a plain footer link, independent of the
    // current devotional and not part of the per-entry share controls.
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });

    const mailHref = await page.locator('#footer-contact-mail').getAttribute('href');
    expect(mailHref).toBe('mailto:develop4God@gmail.com');
  });

  test('native share button calls navigator.share with rich devotional content (verse, reflexión, oración, app FOMO footer)', async ({ page }) => {
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
    // No separate `url` field passed to navigator.share() — some share
    // targets append it a second time on top of `text`, duplicating the
    // link that's already embedded in the "read more" line below.
    expect(calls[0].url).toBeUndefined();
    expect(calls[0].text.length).toBeGreaterThan(0);

    const verseRef = await page.locator('#devotional-verse-ref').textContent();
    const reflexionText = await page.locator('#devotional-reflexion').textContent();
    const oracionText = await page.locator('#devotional-oracion').textContent();

    expect(calls[0].text).toContain('*Daily Devotional*');
    expect(calls[0].text).toContain(verseRef.trim());
    expect(calls[0].text).toContain('Reflection:*');
    expect(calls[0].text).toContain(reflexionText.trim());
    expect(calls[0].text).toContain('Prayer:*');
    expect(calls[0].text).toContain(oracionText.trim());
    expect(calls[0].text).toContain('More devotional content here:');
    expect(calls[0].text).toContain(page.url());

    // FOMO footer, mirroring devocional_nuevo's DevotionalShareHelper —
    // turns each share into a potential new visitor + app install, not just
    // a link back to the same page.
    expect(calls[0].text).toContain('*This is just the beginning...*');
    expect(calls[0].text).toContain('The complete app includes:');
    expect(calls[0].text).toContain('*Download: Christian Devotionals*');
    expect(calls[0].text).toContain('https://play.google.com/store/apps/details?id=com.develop4god.devocional_nuevo');

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
    await expect(page.locator('#footer-contact-mail')).toBeVisible();
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

    // A fresh session starts at the archive's oldest entry (day 1), where
    // "prev" is correctly disabled (see devotional-nav.js) — advance one
    // step first so there's somewhere to go back to, then dismiss the
    // salvation modal that "next" triggers before testing "prev" itself.
    await page.click('#nav-next');
    await expect(page.locator('#salvation-prayer-modal')).toBeVisible();
    await page.click('#salvation-modal-continue');
    await expect(page.locator('#salvation-prayer-modal')).toBeHidden();

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

test.describe('devocionales reader Bible version picker', () => {
  test('lists both available versions for the current language, defaulting to the primary one', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    const select = page.locator('#version-select');
    const options = await select.locator('option').allTextContents();
    expect(options).toEqual(['RVR1960', 'NVI']);
    await expect(select).toHaveValue('RVR1960');
  });

  test('switching version reloads content under the new version and persists the choice', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    const select = page.locator('#version-select');
    const verseRef = page.locator('#devotional-verse-ref');
    const beforeText = await verseRef.textContent();

    await select.selectOption('NVI');
    await expect(verseRef).not.toHaveText(beforeText);
    await expect(verseRef).toContainText('NVI');

    await page.reload({ waitUntil: 'networkidle' });
    await expect(select).toHaveValue('NVI');
    await expect(verseRef).toContainText('NVI');
  });

  test('version choice is isolated per language', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });
    await page.locator('#version-select').selectOption('NVI');
    await expect(page.locator('#devotional-verse-ref')).toContainText('NVI');

    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
    await expect(page.locator('#version-select')).toHaveValue('NIV');
  });
});

test.describe('devocionales reader Bible version copyright notice', () => {
  // Legally-required per-version attribution, ported from devocional_nuevo's
  // copyright_utils.dart. Always visible (not tap-to-expand), placed after
  // the prayer/share section, must update live when the version changes.

  test('shows the current version\'s full name and copyright text', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    const notice = page.locator('#version-copyright');
    await expect(notice).toContainText('RVR1960');
    await expect(notice).toContainText('Reina Valera 1960');
    await expect(notice).toContainText('Sociedades Bíblicas');
  });

  test('updates when the version selection changes', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    const notice = page.locator('#version-copyright');
    await expect(notice).toContainText('RVR1960');

    await page.locator('#version-select').selectOption('NVI');
    await expect(notice).toContainText('NVI');
    await expect(notice).toContainText('Nueva Versión Internacional');
    await expect(notice).not.toContainText('RVR1960');
  });

  test('is localized (label text) per language', async ({ page }) => {
    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
    await expect(page.locator('#version-copyright')).toContainText('Bible version:');

    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });
    await expect(page.locator('#version-copyright')).toContainText('Versión bíblica:');
  });
});

test.describe('devocionales reader version info (i) button', () => {
  // Quick acronym lookup next to the version dropdown ("NVI" -> "Nueva
  // Versión Internacional") — separate from the persistent copyright
  // notice below the prayer section, which stays visible unconditionally.

  test('popover is hidden by default and shows the full name on click', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    const popover = page.locator('#version-info-popover');
    await expect(popover).toBeHidden();

    await page.locator('#version-info-btn').click();
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('Reina Valera 1960');
    await expect(popover).toContainText('RVR1960');
  });

  test('closes when clicking outside', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    await page.locator('#version-info-btn').click();
    await expect(page.locator('#version-info-popover')).toBeVisible();

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#version-info-popover')).toBeHidden();
  });

  test('updates the full name when the version selection changes', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    await page.locator('#version-select').selectOption('NVI');
    await page.waitForSelector('#devotional-content:not(.hidden)');
    await page.locator('#version-info-btn').click();

    const popover = page.locator('#version-info-popover');
    await expect(popover).toContainText('Nueva Versión Internacional');
    await expect(popover).not.toContainText('Reina Valera 1960');
  });
});

test.describe('devocionales reader hero image (Devocionales-assets manifest)', () => {
  // heroImageForDate() fetches the file list from Devocionales-assets'
  // CI-generated index.json instead of a hardcoded array. These assert on
  // what a real visitor sees: a real, loadable hero image, and the page
  // still working end-to-end if that fetch fails — not on request counts
  // or other implementation plumbing, which would make the suite brittle.

  test('hero image loads from the devotionals manifest, not a local list', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    const heroImage = page.locator('#hero-image');
    await expect(heroImage).toBeVisible();
    await expect(heroImage).toHaveJSProperty('complete', true);
    const naturalWidth = await heroImage.evaluate((img) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);

    const src = await heroImage.getAttribute('src');
    expect(src).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/develop4God\/Devocionales-assets\/main\/images\/devotionals\/[^/]+\.avif$/
    );
  });

  test('hero image keeps loading correctly across prev/next navigation', async ({ page }) => {
    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    const heroImage = page.locator('#hero-image');
    await expect(heroImage).toHaveJSProperty('complete', true);

    const h1 = page.locator('h1').first();
    const beforeText = await h1.textContent();

    await page.locator('#nav-next').click();
    await expect(h1).not.toHaveText(beforeText);
    await expect(heroImage).toHaveJSProperty('complete', true);
    const naturalWidthAfterNext = await heroImage.evaluate((img) => img.naturalWidth);
    expect(naturalWidthAfterNext).toBeGreaterThan(0);

    // "next" can trigger the salvation-prayer modal, which overlays the nav
    // buttons — dismiss it first, same as the dedicated modal tests above.
    const salvationModal = page.locator('#salvation-prayer-modal');
    if (await salvationModal.isVisible()) {
      await page.locator('#salvation-modal-continue').click();
      await expect(salvationModal).toBeHidden();
    }

    await page.locator('#nav-prev').click();
    await expect(h1).toHaveText(beforeText);
    await expect(heroImage).toHaveJSProperty('complete', true);
    const naturalWidthAfterPrev = await heroImage.evaluate((img) => img.naturalWidth);
    expect(naturalWidthAfterPrev).toBeGreaterThan(0);
  });

  test('reader still renders with no app errors if the manifest fetch fails', async ({ page }) => {
    await page.route('**/images/devotionals/index.json', (route) => route.abort());

    // The aborted request itself logs a browser-level resource error
    // ("Failed to load resource: net::ERR_FAILED") — that's expected noise
    // from the injected failure, not an app bug. Only uncaught JS
    // exceptions (pageerror) indicate the app itself broke.
    const appErrors = [];
    page.on('pageerror', (e) => appErrors.push(e.message));

    await page.goto('/devocionales/?lang=es', { waitUntil: 'networkidle' });

    const h1 = page.locator('h1').first();
    await expect(h1).not.toHaveText('');
    expect(appErrors).toEqual([]);
  });
});

test.describe('devocionales reader fetch retry gate', () => {
  // Covers the stale-cached-failure bug: a transient fetch failure used to
  // leave the reader stuck on the error state with no way to recover short
  // of a hard reload — real users only escaped via incognito/clear-cache.
  // Deterministic via page.route() interception (abort every year-file
  // request), not real network timing, so this isn't flaky in CI.

  test('shows the error state with a working retry button when the year-file fetch fails, and recovers once the network is restored', async ({ page }) => {
    const appErrors = [];
    page.on('pageerror', (e) => appErrors.push(e.message));

    await page.route('**/Devocionales-json/**/Devocional_year_*.json', (route) => route.abort());

    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });

    const errorState = page.locator('#error-state');
    await expect(errorState).toBeVisible();
    const retryBtn = page.locator('#error-retry');
    await expect(retryBtn).toBeVisible();
    await expect(retryBtn).not.toHaveText('');

    // Restore the network, then use the retry button — not a page reload —
    // to prove the in-page recovery path itself works, matching what a
    // real visitor does without refreshing.
    await page.unroute('**/Devocionales-json/**/Devocional_year_*.json');
    await retryBtn.click();

    await expect(errorState).toBeHidden();
    const h1 = page.locator('h1').first();
    await expect(h1).not.toHaveText('');
    expect(appErrors).toEqual([]);
  });

  test('logs a devotional_load_failed gtag event when the load fails', async ({ page }) => {
    // Block the real gtag.js network script so it can't overwrite the
    // page's own `function gtag(){dataLayer.push(arguments)}` declaration —
    // that inline function is what DevotionalErrorLogger actually calls,
    // so asserting on dataLayer's contents is deterministic and needs no
    // stubbing of window.gtag itself (which the page redefines on load).
    await page.route('https://www.googletagmanager.com/gtag/js*', (route) => route.abort());
    await page.route('**/Devocionales-json/**/Devocional_year_*.json', (route) => route.abort());

    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });
    await expect(page.locator('#error-state')).toBeVisible();

    const dataLayer = await page.evaluate(() => window.dataLayer);
    const errorEvent = dataLayer.find((entry) => entry[0] === 'event' && entry[1] === 'devotional_load_failed');
    expect(errorEvent).toBeDefined();
    expect(errorEvent[2]).toMatchObject({ error_type: expect.any(String) });
  });

  test('retries transient failures automatically before surfacing the error state', async ({ page }) => {
    // First request to each year-file URL fails, subsequent ones succeed —
    // exercises DevotionalFetch.fetchWithRetry's internal retry without
    // ever reaching the visible error UI.
    const seenUrls = new Set();
    await page.route('**/Devocionales-json/**/Devocional_year_*.json', (route) => {
      const url = route.request().url();
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        return route.abort();
      }
      return route.continue();
    });

    const appErrors = [];
    page.on('pageerror', (e) => appErrors.push(e.message));

    await page.goto('/devocionales/?lang=en', { waitUntil: 'networkidle' });

    await expect(page.locator('#error-state')).toBeHidden();
    const h1 = page.locator('h1').first();
    await expect(h1).not.toHaveText('');
    expect(appErrors).toEqual([]);
  });
});

test.describe('devocionales reader nav availability at archive edges', () => {
  // devotional-nav.js's updateNavAvailability() disables "prev"/"next" when
  // there's genuinely nothing to navigate to — previously both buttons were
  // always enabled after render(), so "prev" was clickable-but-inert on a
  // visitor's very first devotional (no earlier entry exists). A mocked,
  // 3-entry single-year archive gives deterministic control over both edges
  // without depending on where the real Devocionales-json archive currently
  // starts/ends.
  const MOCK_DATES = ['2020-01-01', '2020-01-02', '2020-01-03'];

  async function mockSmallArchive(page) {
    await page.route('**/Devocionales-json/**/index.json', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        files: { en: { NIV: { files: { 2019: 'Devocional_year_2019_en_NIV.json' } } } },
      }),
    }));
    await page.route('**/Devocionales-json/**/Devocional_year_2019_en_NIV.json', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          en: Object.fromEntries(MOCK_DATES.map((d, i) => [d, [{
            id: `mock-${i}`, date: d, language: 'en', version: 'NIV',
            versiculo: `Mock ${i} 1:1 NIV: "text"`, reflexion: 'r', oracion: 'o', para_meditar: [], tags: [],
          }]])),
        },
      }),
    }));
  }

  test('prev is disabled on the oldest devotional, enabled after moving forward', async ({ page }) => {
    await mockSmallArchive(page);
    await page.goto(`/devocionales/?lang=en&date=${MOCK_DATES[0]}`, { waitUntil: 'networkidle' });

    await expect(page.locator('#nav-prev')).toBeDisabled();
    await expect(page.locator('#nav-next')).toBeEnabled();

    await page.click('#nav-next');
    await expect(page.locator('#salvation-prayer-modal')).toBeVisible();
    await page.click('#salvation-modal-continue');

    await expect(page.locator('#nav-prev')).toBeEnabled();
  });

  test('next is disabled on the newest devotional', async ({ page }) => {
    await mockSmallArchive(page);
    await page.goto(`/devocionales/?lang=en&date=${MOCK_DATES[MOCK_DATES.length - 1]}`, { waitUntil: 'networkidle' });

    await expect(page.locator('#nav-next')).toBeDisabled();
    await expect(page.locator('#nav-prev')).toBeEnabled();
  });

  test('clicking a disabled prev button does nothing (no navigation, no console errors)', async ({ page }) => {
    const appErrors = [];
    page.on('pageerror', (e) => appErrors.push(e.message));

    await mockSmallArchive(page);
    await page.goto(`/devocionales/?lang=en&date=${MOCK_DATES[0]}`, { waitUntil: 'networkidle' });

    const h1 = page.locator('h1').first();
    const beforeText = await h1.textContent();

    await page.locator('#nav-prev').click({ force: true });
    await page.waitForTimeout(300);

    await expect(h1).toHaveText(beforeText);
    expect(appErrors).toEqual([]);
  });
});

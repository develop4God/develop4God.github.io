// Bible-studies list page (devocionales/estudios/): list from the discovery index, hero, chips,
// badges, favourites, share, error/empty states, languages, theme, devices. The remote JSON is
// served from fixtures through page.route so the run is deterministic and offline-safe.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const DATA = /raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/discovery\//;
const entry = (id, over = {}) => ({
  id,
  version: '1',
  emoji: '🧎',
  files: { en: `${id}_en.json`, es: `${id}_es.json`, ar: `${id}_ar.json` },
  titles: { en: `Title ${id}`, es: `Título ${id}`, ar: `عنوان ${id}` },
  subtitles: { en: `Subtitle ${id}`, es: `Subtítulo ${id}`, ar: `عنوان فرعي ${id}` },
  estimated_reading_minutes: { en: 7, es: 8, ar: 9 },
  ...over,
});
const INDEX = {
  studies: [
    entry('s1'),
    entry('s2'),
    entry('s3'),
    entry('only_es', { files: { es: 'only_es_es.json' } }),
    null,
    { nothing: true },
  ],
};
const STUDY = {
  emoji: '🧎',
  subtitle: 'Sub',
  key_verse: { reference: 'John 13:1', text: 'He loved them unto the end.' },
  cards: [
    { order: 1, type: 'x', icon: '🍽️', title: 'First', content: '• a\n• b', revelation_key: 'Rev' },
    { order: 2, type: 'discovery_activation', title: 'Q', discovery_questions: [{ question: 'Why?' }] },
  ],
};

async function mockData(page, { index = INDEX, indexStatus = 200, study = STUDY } = {}) {
  await page.route(DATA, (route) => {
    const url = route.request().url();
    if (url.endsWith('/discovery/index.json')) {
      return indexStatus === 200
        ? route.fulfill({ json: index })
        : route.fulfill({ status: indexStatus, body: 'nope' });
    }
    return route.fulfill({ json: study });
  });
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // A mocked 500 produces the browser's own "Failed to load resource" line; that is the test's input, not a bug.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

const cards = (page) => page.locator('.study-card');
const card = (page, id) => page.locator(`.study-card[data-study-id="${id}"]`);
const open = async (page, qs = 'lang=en') => {
  await page.goto(`/devocionales/estudios/?${qs}`, { waitUntil: 'networkidle' });
  await expect(cards(page).first()).toBeVisible();
};

test.describe('sanity', () => {
  test('page loads with no console errors and renders only studies available in the language', async ({ page }) => {
    const errors = watchErrors(page);
    await mockData(page);
    await open(page);
    await expect(cards(page)).toHaveCount(3); // only_es hidden, malformed entries skipped
    await expect(page.locator('#studies-title')).toHaveText('Bible Studies');
    await expect(page.locator('#studies-count')).toHaveText('3 studies');
    await expect(card(page, 's1').locator('.study-card-title')).toHaveText('Title s1');
    await expect(card(page, 's1').locator('.study-card-meta')).toContainText('7');
    expect(errors).toEqual([]);
  });
});

test.describe('hero, badges and chips', () => {
  test('first-time user: Start here hero without progress, every card is New', async ({ page }) => {
    await mockData(page);
    await open(page);
    await expect(page.locator('.study-hero-label')).toHaveText('Start here');
    await expect(page.locator('.study-hero [role="progressbar"]')).toHaveCount(0);
    await expect(page.locator('.badge-new')).toHaveCount(3);
  });

  test('progress 7/14 shows Continue with 50%, and the card badge is Current once seen', async ({ page }) => {
    await mockData(page);
    await page.addInitScript(() => {
      localStorage.setItem('discovery_seen_studies', JSON.stringify(['s2']));
      localStorage.setItem('discovery_progress_s2_en', JSON.stringify({ completedSections: [0, 1, 2, 3, 4, 5, 6], totalSections: 14 }));
    });
    await open(page);
    await expect(page.locator('.study-hero-label')).toHaveText('Continue where you left off');
    await expect(page.locator('.study-hero-percent')).toHaveText('50%');
    await expect(card(page, 's2').locator('.study-badge')).toHaveText('Current');
  });

  test('completed studies go last and filters show live counts and a friendly empty state', async ({ page }) => {
    await mockData(page);
    await page.addInitScript(() => {
      localStorage.setItem('discovery_progress_s1_en', JSON.stringify({ isCompleted: true }));
    });
    await open(page);
    await expect(cards(page).last()).toHaveAttribute('data-study-id', 's1');
    await expect(card(page, 's1').locator('.study-badge')).toHaveText('Completed');
    await expect(page.locator('[data-filter="pending"] .study-chip-count')).toHaveText('2');
    await page.locator('[data-filter="completed"]').click();
    await expect(cards(page)).toHaveCount(1);
    await page.locator('[data-filter="favorites"]').click();
    await expect(page.locator('.study-message-title')).toHaveText('No favorite studies yet');
  });

  test('the chosen filter survives a reload in the same session', async ({ page }) => {
    await mockData(page);
    await open(page);
    await page.locator('[data-filter="pending"]').click();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('[data-filter="pending"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('card actions', () => {
  test('favourite: add toasts, remove asks for confirmation first, state persists', async ({ page }) => {
    await mockData(page);
    await open(page);
    const star = card(page, 's2').locator('.study-fav');
    await star.click();
    await expect(page.locator('.toast')).toHaveText('Added to favorites');
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    await page.reload({ waitUntil: 'networkidle' });
    await expect(card(page, 's2').locator('.study-fav')).toHaveAttribute('aria-pressed', 'true');
    await card(page, 's2').locator('.study-fav').click();
    await expect(card(page, 's2').locator('.study-confirm')).toBeVisible();
    await card(page, 's2').locator('.study-confirm-yes').click();
    await expect(page.locator('.toast')).toHaveText('Removed from favorites');
    await expect(card(page, 's2').locator('.study-fav')).toHaveAttribute('aria-pressed', 'false');
  });

  test('favourite: cancelling the confirmation keeps it', async ({ page }) => {
    await mockData(page);
    await page.addInitScript(() => localStorage.setItem('discovery_favorite_ids_en', JSON.stringify(['s1'])));
    await open(page);
    await card(page, 's1').locator('.study-fav').click();
    await card(page, 's1').locator('.study-confirm-no').click();
    await expect(card(page, 's1').locator('.study-confirm')).toHaveCount(0);
    await expect(card(page, 's1').locator('.study-fav')).toHaveAttribute('aria-pressed', 'true');
  });

  test('share without Web Share copies the app summary to the clipboard and toasts', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are granted for chromium only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mockData(page);
    await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
    await open(page);
    await card(page, 's1').locator('.study-share').click();
    await expect(page.locator('.toast')).toHaveText('Copied to clipboard');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('John 13:1');
    expect(text).toContain('Develop4God');
    expect(text).toContain('play.google.com');
  });

  test('share failure shows an error toast', async ({ page }) => {
    await mockData(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
    });
    await open(page);
    await card(page, 's1').locator('.study-share').click();
    await expect(page.locator('.toast')).toHaveText('Error sharing');
    await expect(page.locator('.toast')).toHaveClass(/toast-error/);
  });

  test('opening a study marks it seen and navigates to its deep link', async ({ page }) => {
    await mockData(page);
    await open(page);
    await card(page, 's3').locator('.study-card-open').click();
    await page.waitForURL(/estudios\/\?id=s3/);
    expect(await page.evaluate(() => localStorage.getItem('discovery_seen_studies'))).toContain('s3');
  });
});

test.describe('states', () => {
  test('a failing index shows the error with Retry, and Retry recovers', async ({ page }) => {
    const errors = watchErrors(page);
    let fail = true;
    await page.route(DATA, (route) => (fail
      ? route.fulfill({ status: 404, body: 'nope' })
      : route.fulfill({ json: INDEX })));
    await page.goto('/devocionales/estudios/?lang=en', { waitUntil: 'networkidle' });
    await expect(page.locator('.study-message[role="alert"]')).toBeVisible();
    fail = false;
    await page.locator('.study-retry').click();
    await expect(cards(page)).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test('an empty index shows the empty state', async ({ page }) => {
    await mockData(page, { index: { studies: [] } });
    await page.goto('/devocionales/estudios/?lang=en', { waitUntil: 'networkidle' });
    await expect(page.locator('.study-message')).toContainText('No Bible Studies available');
    await expect(page.locator('.study-chip')).toHaveCount(0);
  });

  test('remote text is rendered as text, never executed (XSS)', async ({ page }) => {
    const errors = watchErrors(page);
    const payload = '<img src=x onerror="window.__pwned=1">';
    await mockData(page, { index: { studies: [entry('x1', { titles: { en: payload }, subtitles: { en: payload }, emoji: payload })] } });
    await open(page);
    await expect(card(page, 'x1').locator('.study-card-title')).toHaveText(payload);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    await expect(page.locator('.study-card img')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('blocked localStorage never breaks rendering', async ({ page }) => {
    const errors = watchErrors(page);
    await mockData(page);
    await page.addInitScript(() => {
      const boom = () => { throw new Error('SecurityError'); };
      Storage.prototype.getItem = boom;
      Storage.prototype.setItem = boom;
    });
    await page.goto('/devocionales/estudios/?lang=en', { waitUntil: 'networkidle' });
    await expect(cards(page)).toHaveCount(3);
    expect(errors.filter((e) => !/SecurityError/.test(e))).toEqual([]);
  });
});

test.describe('language, theme and layout', () => {
  test('Spanish shows the Spanish studies and strings; Arabic is right-to-left', async ({ page }) => {
    const errors = watchErrors(page);
    await mockData(page);
    await open(page, 'lang=es');
    await expect(cards(page)).toHaveCount(4); // only_es is available in Spanish
    await expect(page.locator('#studies-title')).toHaveText('Estudios Bíblicos');
    await page.goto('/devocionales/estudios/?lang=ar', { waitUntil: 'networkidle' });
    await expect(cards(page).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(errors).toEqual([]);
  });

  // One test per language (like the reader spec): ten sequential navigations in one test would exceed the timeout on WebKit.
  for (const lang of ['es', 'en', 'pt', 'fr', 'ja', 'zh', 'hi', 'de', 'ar', 'fil']) {
    test(`loads without errors in ${lang}`, async ({ page }) => {
      const errors = watchErrors(page);
      const files = Object.fromEntries(['es', 'en', 'pt', 'fr', 'ja', 'zh', 'hi', 'de', 'ar', 'fil'].map((l) => [l, `a_${l}.json`]));
      await mockData(page, { index: { studies: [entry('a', { files })] } });
      await page.goto(`/devocionales/estudios/?lang=${lang}`, { waitUntil: 'networkidle' });
      await expect(cards(page)).toHaveCount(1);
      await expect(page.locator('#studies-title')).not.toHaveText('');
      await expect(page.locator('.study-chip-label').first()).not.toHaveText('');
      expect(errors).toEqual([]);
    });
  }

  test('the stored theme is applied; the page has no language or theme controls of its own (they live in Settings)', async ({ page }) => {
    await mockData(page);
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await open(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.theme-switch')).toHaveCount(0);
    await expect(page.locator('.language-selector-button')).toHaveCount(0);
  });

  test('no horizontal overflow and the grid column count follows the viewport', async ({ page }) => {
    await mockData(page);
    for (const [width, columns] of [[320, 1], [820, 2], [1280, 3]]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      const count = await page.evaluate(() => getComputedStyle(document.querySelector('.study-grid')).gridTemplateColumns.split(' ').length);
      expect(count).toBe(columns);
    }
  });

  test('touch targets are at least 44px', async ({ page }) => {
    await mockData(page);
    await open(page);
    for (const sel of ['.study-fav', '.study-share', '.study-chip', '.study-hero-button']) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box.width, sel).toBeGreaterThanOrEqual(43.5);
      expect(box.height, sel).toBeGreaterThanOrEqual(43.5);
    }
  });
});

test.describe('regression: other pages are unaffected by the shared theme and chrome styles', () => {
  for (const url of ['/devocionales/?lang=en', '/devocionales/privacy-policy.html?lang=en', '/devocionales/terms-and-conditions.html?lang=en']) {
    test(`${url} still loads styled with a working theme switch`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(url, { waitUntil: 'networkidle' });
      const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const before = await bg();
      await page.locator('.theme-switch').click();
      await expect.poll(bg).not.toBe(before); // body may transition its background
      expect(errors).toEqual([]);
    });
  }
});

// Encounters list page (devocionales/encounters/): first-visit welcome, sequential lock, unlock sheet,
// progress, error/empty states, languages, and both surfaces (browser tab and the installed app's bottom
// bar). The remote index and images are served from fixtures through page.route (deterministic, offline-safe).
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const PAGE = '/devocionales/encounters/';
const INDEX_URL = /raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/encounters\/index\.json/;
const IMAGES = /raw\.githubusercontent\.com\/develop4God\/Devocionales-assets\/.*\/images\/encounters\//;
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const entry = (id, over = {}) => ({
  id,
  version: '1',
  status: 'published',
  emoji: '🌊',
  accent_color: '#1e3a5f',
  intro_image: `${id}_intro.png`,
  files: { en: `${id}_en.json`, es: `${id}_es.json`, ar: `${id}_ar.json` },
  titles: { en: `Title ${id}`, es: `Título ${id}`, ar: `عنوان ${id}` },
  subtitles: { en: `Sub ${id}`, es: `Sub ${id}`, ar: `فرعي ${id}` },
  scripture_reference: { en: 'Matthew 14:22-33', es: 'Mateo 14:22-33', ar: 'متى ١٤' },
  estimated_reading_minutes: { en: 5, es: 6, ar: 7 },
  ...over,
});
const INDEX = {
  encounters: [
    entry('a'),
    entry('b'),
    entry('c'),
    entry('soon', { status: 'coming_soon', files: {}, release_date: { en: 'Next week' } }),
    null,
    { nothing: true },
  ],
};

async function mockData(page, { index = INDEX, indexStatus = 200 } = {}) {
  await page.route(INDEX_URL, (route) => (indexStatus === 200
    ? route.fulfill({ json: index })
    : route.fulfill({ status: indexStatus, body: 'nope' })));
  await page.route(IMAGES, (route) => route.fulfill({ contentType: 'image/png', body: PNG_1X1 }));
}

// Language, and whether the first-visit welcome was already seen.
async function seed(page, { lang = 'en', welcomeSeen = true, completed = null } = {}) {
  await page.addInitScript(({ language, seen, done }) => {
    try {
      localStorage.setItem('develop4God_language', language);
      if (seen) localStorage.setItem('develop4God_encounters_welcome_seen', 'true');
      if (done) localStorage.setItem('develop4God_encounters_completed', JSON.stringify(done));
    } catch (_) { /* storage blocked */ }
  }, { language: lang, seen: welcomeSeen, done: completed });
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

const cards = (page) => page.locator('.encounter-card');
const card = (page, id) => page.locator(`.encounter-card[data-encounter-id="${id}"]`);
const installedIos = (page) => page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));

test.describe('first visit: the welcome screen (same as the app)', () => {
  test('shows once; Begin dismisses it, focus moves to the page, and it never returns', async ({ page }) => {
    const errors = watchErrors(page);
    await mockData(page);
    await seed(page, { welcomeSeen: false });
    await page.goto(PAGE);
    const welcome = page.getByRole('dialog', { name: /They found Him\./ });
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText('Changed forever.');
    await expect(welcome).toContainText('The same Jesus. Here. Now.');
    await expect(welcome).toContainText('Real stories. The real Jesus.');
    await expect(page.locator('.encounter-welcome-begin')).toBeFocused();
    // the page behind cannot be reached while the welcome is open
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    await page.locator('.encounter-welcome-begin').click();
    await expect(welcome).toHaveCount(0);
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#encounters-title')).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('develop4God_encounters_welcome_seen'))).toBe('true');
    await page.reload();
    await expect(cards(page).first()).toBeVisible();
    await expect(page.locator('.encounter-welcome')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('Escape dismisses it like Begin', async ({ page }) => {
    await mockData(page);
    await seed(page, { welcomeSeen: false });
    await page.goto(PAGE);
    await expect(page.locator('.encounter-welcome')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.encounter-welcome')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('develop4God_encounters_welcome_seen'))).toBe('true');
  });

  test('uses the app copy in the reader language (es) and mirrors in Arabic (rtl)', async ({ page }) => {
    await mockData(page);
    await seed(page, { lang: 'es', welcomeSeen: false });
    await page.goto(PAGE);
    await expect(page.locator('.encounter-welcome')).toContainText('Ellos lo encontraron.');
    await expect(page.locator('.encounter-welcome-begin')).toHaveText('Comenzar');
    await page.locator('.encounter-welcome-begin').click();
    await page.evaluate(() => localStorage.clear());
    await seed(page, { lang: 'ar', welcomeSeen: false });
    await page.goto(PAGE);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('.encounter-welcome')).toContainText('وجدوه.');
  });

  test('is not shown again to a returning visitor, and the list is usable immediately', async ({ page }) => {
    await mockData(page);
    await seed(page);
    await page.goto(PAGE);
    await expect(page.locator('.encounter-welcome')).toHaveCount(0);
    await expect(cards(page)).toHaveCount(4);
  });
});

test.describe('the list and the sequential lock', () => {
  test('cards in index order; first open, the rest locked, coming soon is not a button; malformed entries skipped', async ({ page }) => {
    const errors = watchErrors(page);
    await mockData(page);
    await seed(page);
    await page.goto(PAGE);
    await expect(cards(page)).toHaveCount(4);
    expect(await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-encounter-id')))).toEqual(['a', 'b', 'c', 'soon']);
    await expect(page.locator('#encounters-count')).toHaveText('3 encounters');
    await expect(card(page, 'a')).toHaveClass(/encounter-card--open/);
    await expect(card(page, 'a').locator('.encounter-badge')).toHaveText('Current');
    await expect(card(page, 'b')).toHaveClass(/encounter-card--locked/);
    await expect(card(page, 'b').locator('.encounter-card-hint')).toHaveText('Complete to access: Title a');
    await expect(card(page, 'b')).toHaveClass(/encounter-card--next-locked/);
    await expect(card(page, 'c')).not.toHaveClass(/encounter-card--next-locked/);
    await expect(card(page, 'soon').locator('.study-card-open')).toHaveCount(0);
    await expect(card(page, 'soon').locator('.encounter-card-release')).toHaveText('Next week');
    await expect(card(page, 'soon').locator('.encounter-badge')).toHaveText('COMING SOON');
    expect(errors).toEqual([]);
  });

  test('completed progress opens the next card; a stored list that is corrupt is ignored', async ({ page }) => {
    await mockData(page);
    await seed(page, { completed: ['a'] });
    await page.goto(PAGE);
    await expect(card(page, 'a').locator('.encounter-badge')).toHaveText('Completed');
    await expect(card(page, 'b')).toHaveClass(/encounter-card--open/);
    await expect(card(page, 'b').locator('.encounter-badge')).toHaveText('Current');
    await expect(card(page, 'c')).toHaveClass(/encounter-card--locked/);
    // registered after seed(), so on the reload it runs later and replaces the stored list with garbage
    await page.addInitScript(() => localStorage.setItem('develop4God_encounters_completed', '{broken'));
    await page.reload();
    await expect(card(page, 'a')).toHaveClass(/encounter-card--open/);
    await expect(card(page, 'b')).toHaveClass(/encounter-card--locked/);
  });

  test('B6 completing in another tab opens the next card here without a reload', async ({ page }) => {
    await mockData(page);
    await seed(page);
    await page.goto(PAGE);
    await expect(card(page, 'b')).toHaveClass(/encounter-card--locked/);
    await page.evaluate(() => {
      localStorage.setItem('develop4God_encounters_completed', JSON.stringify(['a']));
      window.dispatchEvent(new StorageEvent('storage', { key: 'develop4God_encounters_completed' }));
    });
    await expect(card(page, 'b')).toHaveClass(/encounter-card--open/);
  });
});

test.describe('the unlock sheet', () => {
  test('tapping a locked card opens it; Keep reading closes it and focus returns to the card', async ({ page }) => {
    await mockData(page);
    await seed(page);
    await page.goto(PAGE);
    await card(page, 'b').locator('.study-card-open').click();
    const sheet = page.getByRole('dialog', { name: 'Read at your own pace' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Everything is free.');
    await expect(sheet.locator('.encounter-sheet-keep')).toBeFocused();
    // PayPal is on in the shipped config: the support button replaces the Play link (the link returns only if the SDK fails).
    await expect(sheet.locator('.encounter-sheet-support')).toBeVisible();
    await expect(sheet.locator('.encounter-sheet-play')).toHaveCount(0);
    await sheet.locator('.encounter-sheet-keep').click();
    await expect(sheet).toHaveCount(0);
    await expect(card(page, 'b').locator('.study-card-open')).toBeFocused();
  });

  test('Escape and the backdrop close it; the page behind is inert while it is open', async ({ page }) => {
    await mockData(page);
    await seed(page);
    await page.goto(PAGE);
    await card(page, 'c').locator('.study-card-open').click();
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('.encounter-sheet')).toHaveCount(0);
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    await card(page, 'c').locator('.study-card-open').click();
    await page.locator('.encounter-sheet-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('.encounter-sheet')).toHaveCount(0);
  });

  test('no Play link on iOS (there is no Android app to open)', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    const page = await context.newPage();
    await mockData(page);
    await seed(page);
    await page.goto(PAGE);
    await card(page, 'b').locator('.study-card-open').click();
    await expect(page.locator('.encounter-sheet')).toBeVisible();
    await expect(page.locator('.encounter-sheet-play')).toHaveCount(0);
    await context.close();
  });
});

test.describe('states, languages and layout', () => {
  test('a failed index shows the error with Retry, and Retry recovers', async ({ page }) => {
    await seed(page);
    let fail = true;
    await page.route(INDEX_URL, (route) => (fail ? route.fulfill({ status: 500, body: 'no' }) : route.fulfill({ json: INDEX })));
    await page.route(IMAGES, (route) => route.fulfill({ contentType: 'image/png', body: PNG_1X1 }));
    await page.goto(PAGE);
    await expect(page.getByRole('alert')).toContainText('Could not load encounters. Please try again.');
    fail = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(cards(page)).toHaveCount(4);
  });

  test('an empty index shows the empty state', async ({ page }) => {
    await mockData(page, { index: { encounters: [] } });
    await seed(page);
    await page.goto(PAGE);
    await expect(page.locator('.study-message')).toContainText('No encounters available yet.');
  });

  test('titles come from the index in the reader language (es) and a missing language hides the card', async ({ page }) => {
    await mockData(page, { index: { encounters: [entry('a'), entry('b', { files: { en: 'b_en.json' } })] } });
    await seed(page, { lang: 'es' });
    await page.goto(PAGE);
    await expect(cards(page)).toHaveCount(1);
    await expect(card(page, 'a').locator('.study-card-title')).toHaveText('Título a');
    await expect(page.locator('#encounters-title')).toHaveText('Encuentros');
  });

  test('no horizontal overflow, in light and dark themes', async ({ page }) => {
    await mockData(page);
    await seed(page);
    for (const theme of ['light', 'dark']) {
      await page.addInitScript((value) => { try { localStorage.setItem('develop4God_theme', value); } catch (_) { /* blocked */ } }, theme);
      await page.goto(PAGE);
      await expect(cards(page).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test('an image that fails to load never breaks the card', async ({ page }) => {
    const errors = watchErrors(page);
    await seed(page);
    await page.route(INDEX_URL, (route) => route.fulfill({ json: INDEX }));
    await page.route(IMAGES, (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(PAGE);
    await expect(cards(page)).toHaveCount(4);
    await expect(card(page, 'a').locator('.study-card-title')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('the two surfaces', () => {
  test('browser tab: header links to the devotional, studies and encounters; no bottom bar', async ({ page }) => {
    await mockData(page);
    await seed(page);
    await page.goto(PAGE);
    const nav = page.locator('#encounters-nav');
    await expect(nav.getByRole('link', { name: 'Encounters' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: "Today's Devotional" })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Bible Studies' })).toBeVisible();
    await expect(page.locator('#shell-nav .shell-tab')).toHaveCount(0);
  });

  test('installed app (iOS): the bottom bar has Encounters as the current tab and the header links are hidden', async ({ page }) => {
    await mockData(page);
    await installedIos(page);
    await seed(page);
    await page.goto(PAGE);
    await expect(page.locator('#shell-nav [data-shell-tab="encounters"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#shell-nav [data-shell-tab]')).toHaveCount(4);
    await expect(page.locator('#encounters-nav')).toBeHidden();
    await expect(cards(page).first()).toBeVisible();
  });

  test('the other pages link here: the reader header (browser tab) and the studies header', async ({ page }) => {
    await seed(page);
    await page.route(/raw\.githubusercontent\.com/, (route) => route.fulfill({ json: {} }));
    await page.goto('/devocionales/?lang=en');
    await expect(page.locator('#nav-encounters-label')).toHaveAttribute('href', '/devocionales/encounters/');
    await page.goto('/devocionales/estudios/');
    await expect(page.locator('#studies-nav a[href="/devocionales/encounters/"]')).toBeVisible();
  });
});

// A returning visitor can hold the previous estudios/index.html (it does not load content-index.js or
// storage-json.js) while the scripts are the new ones. The studies page must still work.
test.describe('compatibility: previous studies HTML with the new scripts', () => {
  test('the Bible-studies list still renders', async ({ page }) => {
    const errors = watchErrors(page);
    const previousHtml = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures', 'previous-deploy', 'estudios-index.html.txt'), 'utf8');
    await page.route(/\/devocionales\/estudios\/(index\.html)?(\?.*)?$/, (route) => route.fulfill({ contentType: 'text/html', body: previousHtml }));
    await page.route(/raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/discovery\//, (route) => route.fulfill({
      json: route.request().url().endsWith('/discovery/index.json')
        ? { studies: [{ id: 's1', version: '1', emoji: '🧎', files: { en: 's1.json' }, titles: { en: 'Study one' } }] }
        : { cards: [] },
    }));
    await seed(page);
    await page.goto('/devocionales/estudios/');
    await expect(page.locator('.study-card')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});

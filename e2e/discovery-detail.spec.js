// Bible-study reader (devocionales/estudios/?id=...): deep link, paging (buttons, keys, swipe),
// completion, copyright, back handling, progress shown back on the list. Remote JSON is served
// from real study fixtures (copied from Devocionales-json) through page.route.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const DATA = /raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/discovery\//;
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/discovery', name), 'utf8'));
const ASCENSION = fixture('ascension_victory_en_001.json');
const INDEX = {
  studies: [
    { id: 'ascension', version: '1', emoji: '🕊️', files: { en: 'ascension_victory_en_001.json', ar: 'ascension_victory_en_001.json' }, titles: { en: ASCENSION.title, ar: 'عنوان' }, subtitles: { en: ASCENSION.subtitle }, estimated_reading_minutes: { en: 8, ar: 8 } },
    { id: 'balaam', version: '1', emoji: '🐴', files: { en: 'balaam_humble_vision_en_001.json' }, titles: { en: 'Balaam' }, subtitles: { en: 'Sub' }, estimated_reading_minutes: { en: 9 } },
  ],
};
const CARDS = ASCENSION.cards.length;
const PAGES = CARDS + 1; // key verse page first

async function mockData(page) {
  await page.route(DATA, (route) => {
    const url = route.request().url();
    if (url.endsWith('/discovery/index.json')) return route.fulfill({ json: INDEX });
    if (url.includes('ascension')) return route.fulfill({ json: ASCENSION });
    if (url.includes('balaam')) return route.fulfill({ json: fixture('balaam_humble_vision_en_001.json') });
    return route.fulfill({ status: 404, body: 'nope' });
  });
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return errors;
}

const openStudy = async (page, id = 'ascension', qs = 'lang=en') => {
  await page.goto(`/devocionales/estudios/?${qs}&id=${id}`, { waitUntil: 'networkidle' });
  await expect(page.locator('.study-page')).toBeVisible();
};

test.describe('sanity', () => {
  test('a deep link opens the study with the key verse first, no console errors', async ({ page }) => {
    const errors = watchErrors(page);
    await mockData(page);
    await openStudy(page);
    await expect(page.locator('.study-detail-title')).toHaveText(ASCENSION.title);
    await expect(page.locator('.study-keyverse-text')).toHaveText(ASCENSION.key_verse.text);
    await expect(page.locator('.study-seg')).toHaveCount(PAGES);
    await expect(page.locator('#studies-list-view')).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe('paging', () => {
  test('Next / Previous move through the cards; Previous is disabled on the first page', async ({ page }) => {
    await mockData(page);
    await openStudy(page);
    await expect(page.locator('.study-prev')).toBeDisabled();
    await page.locator('.study-next').click();
    await expect(page.locator('.study-page-title')).toHaveText(ASCENSION.cards[0].title);
    await page.locator('.study-prev').click();
    await expect(page.locator('.study-keyverse-label')).toBeVisible();
  });

  test('arrow keys page, and the focus moves to the new page', async ({ page }) => {
    await mockData(page);
    await openStudy(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.study-page-title')).toHaveText(ASCENSION.cards[0].title);
    await expect(page.locator('.study-page')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.study-keyverse-label')).toBeVisible();
  });

  test('RTL (Arabic) mirrors the arrow keys', async ({ page }) => {
    await mockData(page);
    await openStudy(page, 'ascension', 'lang=ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.study-page-title')).toHaveText(ASCENSION.cards[0].title);
  });

  test('swiping left goes to the next card on touch devices', async ({ page }) => {
    await mockData(page);
    await openStudy(page);
    await page.evaluate(() => {
      // Plain events carrying changedTouches: the Touch/TouchEvent constructors are missing in some engines.
      const view = document.getElementById('studies-detail-view');
      const touch = (type, x) => {
        const event = new Event(type, { bubbles: true });
        Object.defineProperty(event, 'changedTouches', { value: [{ clientX: x, clientY: 300 }] });
        view.dispatchEvent(event);
      };
      touch('touchstart', 300);
      touch('touchend', 120);
    });
    await expect(page.locator('.study-page-title')).toHaveText(ASCENSION.cards[0].title);
  });
});

test.describe('card content (real study data)', () => {
  test('every card renders its title, and Greek words / questions / prayer show on the right cards', async ({ page }) => {
    const errors = watchErrors(page);
    await mockData(page);
    await openStudy(page);
    for (const card of ASCENSION.cards) {
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.study-page-title')).toHaveText(card.title);
      if (card.greek_words) await expect(page.locator('.study-word')).toHaveCount(card.greek_words.length);
      if (card.discovery_questions) {
        await expect(page.locator('.study-question')).toHaveCount(card.discovery_questions.length);
        await expect(page.locator('.study-prayer-text')).toHaveText(card.prayer.content);
      }
    }
    expect(errors).toEqual([]);
  });

  test('Hebrew words, action steps and the study with every field render without errors', async ({ page }) => {
    const errors = watchErrors(page);
    await mockData(page);
    await openStudy(page, 'balaam');
    const balaam = fixture('balaam_humble_vision_en_001.json');
    for (const card of balaam.cards) {
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.study-page-title')).toHaveText(card.title);
      if (card.hebrew_words) await expect(page.locator('.study-word-term').first()).toHaveText(card.hebrew_words[0].word);
      if (card.action_steps) await expect(page.locator('.study-step')).toHaveCount(card.action_steps.length);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('completion, copyright and progress', () => {
  test('the last card shows the study\'s own copyright and completes the study (C4, C5)', async ({ page }) => {
    await mockData(page);
    await openStudy(page);
    for (let i = 0; i < CARDS; i++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('.study-copyright')).toContainText('King James');
    await page.locator('.study-complete').click();
    await expect(page.locator('.toast')).toHaveText('Study completed successfully');
    await expect(page.locator('.study-complete')).toBeDisabled();
    await expect(page.locator('.study-complete')).toHaveText('Study completed');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('discovery_progress_ascension_en')).isCompleted)).toBe(true);
  });

  test('reading marks progress with the card count so the list can show the percentage', async ({ page }) => {
    await mockData(page);
    await openStudy(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('discovery_progress_ascension_en')));
    expect(progress.totalSections).toBe(CARDS);
    expect(progress.completedSections).toEqual([0, 1]);
  });

  test('reopening resumes at the first unread card', async ({ page }) => {
    await mockData(page);
    await openStudy(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.goto(`/devocionales/estudios/?lang=en&id=ascension`, { waitUntil: 'networkidle' });
    await expect(page.locator('.study-page-title')).toHaveText(ASCENSION.cards[2].title);
  });
});

test.describe('navigation and back (C6, C7)', () => {
  test('opening from the list pushes history; Back returns to the list, not off the page', async ({ page }) => {
    await mockData(page);
    await page.goto('/devocionales/estudios/?lang=en', { waitUntil: 'networkidle' });
    await expect(page.locator('.study-card').first()).toBeVisible();
    await page.locator('.study-card[data-study-id="ascension"] .study-card-open').click();
    await expect(page.locator('.study-detail-title')).toBeVisible();
    await expect(page).toHaveURL(/id=ascension/);
    await page.goBack();
    await expect(page.locator('#studies-list-view')).toBeVisible();
    await expect(page.locator('.study-card').first()).toBeVisible();
    await expect(page).toHaveURL(/estudios\/\?lang=en$/);
  });

  test('the list shows progress after reading: Current badge and a Continue hero with the percentage', async ({ page }) => {
    await mockData(page);
    await page.goto('/devocionales/estudios/?lang=en', { waitUntil: 'networkidle' });
    await page.locator('.study-card[data-study-id="ascension"] .study-card-open').click();
    await expect(page.locator('.study-page')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.study-page-title')).toHaveText(ASCENSION.cards[0].title);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.study-page-title')).toHaveText(ASCENSION.cards[1].title);
    await page.goBack();
    await expect(page.locator('.study-hero-label')).toHaveText('Continue where you left off');
    await expect(page.locator('.study-hero-percent')).toHaveText(`${Math.round((2 / CARDS) * 100)}%`);
  });

  test('Exit on the last card returns to the list', async ({ page }) => {
    await mockData(page);
    await page.goto('/devocionales/estudios/?lang=en', { waitUntil: 'networkidle' });
    await page.locator('.study-card[data-study-id="ascension"] .study-card-open').click();
    await expect(page.locator('.study-page')).toBeVisible();
    for (let i = 0; i < CARDS; i++) await page.keyboard.press('ArrowRight');
    await page.locator('.study-exit').click();
    await expect(page.locator('#studies-list-view')).toBeVisible();
  });

  test('Exit on a deep link replaces the URL with the list and keeps Back leaving the page', async ({ page }) => {
    await mockData(page);
    await openStudy(page);
    for (let i = 0; i < CARDS; i++) await page.keyboard.press('ArrowRight');
    await page.locator('.study-exit').click();
    await expect(page.locator('#studies-list-view')).toBeVisible();
    await expect(page).toHaveURL(/estudios\/\?lang=en$/);
  });

  test('an unknown study id shows "not found" with a way back to the list', async ({ page }) => {
    await mockData(page);
    await page.goto('/devocionales/estudios/?lang=en&id=does_not_exist', { waitUntil: 'networkidle' });
    await expect(page.locator('.study-message')).toContainText('Study not found.');
    await page.locator('.study-back').click();
    await expect(page.locator('#studies-list-view')).toBeVisible();
  });

  test('a failing study file shows the error with Retry that recovers', async ({ page }) => {
    let fail = true;
    await page.route(DATA, (route) => {
      const url = route.request().url();
      if (url.endsWith('/discovery/index.json')) return route.fulfill({ json: INDEX });
      return fail ? route.fulfill({ status: 404, body: 'nope' }) : route.fulfill({ json: ASCENSION });
    });
    await page.goto('/devocionales/estudios/?lang=en&id=ascension', { waitUntil: 'networkidle' });
    await expect(page.locator('.study-message[role="alert"]')).toBeVisible();
    fail = false;
    await page.locator('.study-retry').click();
    await expect(page.locator('.study-detail-title')).toBeVisible();
  });
});

test.describe('completion celebration', () => {
  async function finish(page) {
    await mockData(page);
    await openStudy(page);
    for (let i = 0; i < CARDS; i++) await page.keyboard.press('ArrowRight');
    await page.locator('.study-complete').click();
  }

  test('completing a study throws confetti that clears itself and never blocks taps', async ({ page }) => {
    await finish(page);
    const layer = page.locator('.celebration');
    await expect(layer).toHaveCount(1);
    await expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(await layer.locator('.confetti-piece').count()).toBeGreaterThan(10);
    expect(await layer.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    await expect(layer).toHaveCount(0, { timeout: 5000 });
  });

  test('no confetti when the viewer prefers reduced motion; the study still completes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await finish(page);
    await expect(page.locator('.study-complete')).toBeDisabled();
    await expect(page.locator('.celebration')).toHaveCount(0);
  });

  test('reopening a completed study does not celebrate again', async ({ page }) => {
    await finish(page);
    await expect(page.locator('.celebration')).toHaveCount(0, { timeout: 5000 });
    await page.reload();
    await page.waitForSelector('.study-page');
    for (let i = 0; i < PAGES && !(await page.locator('.study-complete').isVisible()); i++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('.study-complete')).toBeDisabled();
    await expect(page.locator('.celebration')).toHaveCount(0);
  });
});

test.describe('layout', () => {
  test('no horizontal overflow on any page of a study at 320px, touch targets >= 44px', async ({ page }) => {
    await mockData(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await openStudy(page);
    for (let i = 0; i < PAGES; i++) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `page ${i}`).toBe(false);
      if (i < PAGES - 1) await page.keyboard.press('ArrowRight');
    }
    for (const sel of ['.study-prev', '.study-exit', '.study-complete']) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box.height, sel).toBeGreaterThanOrEqual(43.5);
    }
  });
});

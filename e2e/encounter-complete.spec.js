// Completing an encounter on the Encounters reader: the Bible-studies completion button (reader-complete)
// plays its done state, and the same completion toast Bible studies shows appears with the encounter wording.
// Remote index and encounter file are served from inline data through page.route (offline-safe).
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const PAGE = '/devocionales/encounters/';
const INDEX_URL = /raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/encounters\/index\.json/;
const FILE_URL = /raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/encounters\/en\/a_en\.json/;
const IMAGES = /raw\.githubusercontent\.com\/develop4God\/Devocionales-assets\/.*\/images\/encounters\//;
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const INDEX = {
  encounters: [{
    id: 'a', version: '1', status: 'published', emoji: '🌊', accent_color: '#1e3a5f', intro_image: 'a_intro.png',
    files: { en: 'a_en.json' }, titles: { en: 'Title a' }, subtitles: { en: 'Sub a' },
    scripture_reference: { en: 'Matthew 14:22-33' }, estimated_reading_minutes: { en: 5 },
  }],
};
const ENCOUNTER = {
  id: 'a',
  bible_version: 'KJ2000',
  key_verse: { reference: 'Mark 10:46', text: 'And they came to Jericho', bible_version: 'KJ2000' },
  cards: [
    { order: 1, type: 'cinematic_scene', title: 'The road', narrative: 'They walked.' },
    { order: 2, type: 'completion', completion_verse: { reference: 'Mark 10:52', text: 'Go thy way' } },
  ],
};

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('completing an encounter shows the done button, the check, and the encounter completion toast', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route(INDEX_URL, (route) => route.fulfill({ json: INDEX }));
  await page.route(FILE_URL, (route) => route.fulfill({ json: ENCOUNTER }));
  await page.route(IMAGES, (route) => route.fulfill({ contentType: 'image/png', body: PNG_1X1 }));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('develop4God_language', 'en');
      localStorage.setItem('develop4God_encounters_welcome_seen', 'true');
    } catch (_) { /* storage blocked */ }
  });
  await page.goto(PAGE);
  await page.locator('.encounter-card[data-encounter-id="a"]').click();
  await page.locator('.encounter-intro-enter').click();
  // Key verse, then the cinematic card, then the completion card.
  await page.locator('.reader-next').click();
  await page.locator('.reader-next').click();
  const button = page.locator('.reader-complete');
  await expect(button).toHaveText('ENCOUNTER COMPLETE');
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveText('Encounter completed');
  await expect(button.locator('.reader-complete-check')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Encounter completed successfully');
  expect(errors).toEqual([]);
});

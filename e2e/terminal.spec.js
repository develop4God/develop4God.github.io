// Coverage for the /terminal/ preview: entry behaviour, path choice, languages,
// themes, stats wiring, reduced motion and mobile layout.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

const EN_VERSE = 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men.';
const ES_VERSE = 'Y todo lo que hagáis, hacedlo de corazón, como para el Señor y no para los hombres.';

async function scrollStory(page, id, fraction) {
  await page.evaluate(([sid, f]) => {
    const s = document.getElementById(sid);
    const travel = s.offsetHeight - s.querySelector('.pin').offsetHeight;
    window.scrollTo(0, s.offsetTop + travel * f);
  }, [id, fraction]);
  await page.waitForTimeout(250);
}

test('entry needs no input: verse shown, logo canvas painted, no console errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  await expect(page.locator('.hero-verse, #story-hero .verse')).toHaveText(EN_VERSE);
  await expect(page.locator('#story-hero .refline')).toContainText('Colossians 3:23');
  await page.waitForTimeout(2200);
  const painted = await page.evaluate(() => {
    const c = document.querySelector('#story-hero .scene'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(500);
  await expect(page.locator('#path-hire')).toBeHidden();
  await expect(page.locator('#path-ministry')).toBeHidden();
  await expect(page.locator('#contact')).toBeHidden();
  expect(errors).toEqual([]);
});

test('only the active hero panel is reachable: inactive panels are inert', async ({ page }) => {
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  const panels = page.locator('#story-hero [data-panel]');
  await expect(panels.nth(0)).not.toHaveAttribute('inert', '');
  await expect(panels.nth(1)).toHaveAttribute('inert', '');
  await scrollStory(page, 'story-hero', 0.9);
  await expect(panels.nth(1)).toHaveClass(/on/);
  await expect(panels.nth(1)).not.toHaveAttribute('inert', '');
  await expect(panels.nth(0)).toHaveAttribute('inert', '');
});

test('choosing Hire me reveals only that path; switch link flips to Ministry', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  await scrollStory(page, 'story-hero', 0.9);
  await page.locator('a.door.hire').click();
  await expect(page.locator('#path-hire')).toBeVisible();
  await expect(page.locator('#path-ministry')).toBeHidden();
  await expect(page.locator('#contact')).toBeVisible();
  expect(page.url()).toContain('#hire');
  await expect(page.locator('#cases .case')).toHaveCount(6);
  await page.locator('[data-switch="ministry"]').click();
  await expect(page.locator('#path-ministry')).toBeVisible();
  await expect(page.locator('#path-hire')).toBeHidden();
  expect(page.url()).toContain('#ministry');
  expect(errors).toEqual([]);
});

test('deep link #ministry opens the ministry path; stats come from app-stats.json', async ({ page, request }) => {
  const errors = trackErrors(page);
  const stats = await (await request.get('/data/app-stats.json')).json();
  await page.goto('/terminal/#ministry', { waitUntil: 'networkidle' });
  await expect(page.locator('#path-ministry')).toBeVisible();
  await page.locator('.stats').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600);
  await expect(page.locator('[data-app-stat="downloads"]')).toHaveText(stats.downloads);
  await expect(page.locator('[data-app-stat="activeUsers"]')).toHaveText(stats.activeUsers);
  await expect(page.locator('[data-app-stat="ratingDisplay"]')).toHaveText(stats.ratingDisplay);
  expect(errors).toEqual([]);
});

test('language: ES switch changes verse and copy, persists the shared key, survives reload', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  await page.locator('button[data-lang="es"]').click();
  await expect(page.locator('#story-hero .verse')).toHaveText(ES_VERSE);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  expect(await page.evaluate(() => localStorage.getItem('develop4God_language'))).toBe('es');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#story-hero .verse')).toHaveText(ES_VERSE);
  await expect(page.locator('button[data-lang="es"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('language: ?lang=es applies without persisting; unsupported falls back to English', async ({ page }) => {
  await page.goto('/terminal/?lang=es', { waitUntil: 'networkidle' });
  await expect(page.locator('#story-hero .verse')).toHaveText(ES_VERSE);
  expect(await page.evaluate(() => localStorage.getItem('develop4God_language'))).toBeNull();
  await page.goto('/terminal/?lang=xx', { waitUntil: 'networkidle' });
  await expect(page.locator('#story-hero .verse')).toHaveText(EN_VERSE);
});

test('theme: toggle flips light/dark, persists, and the canvas palette follows', async ({ page }) => {
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const lime = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lime').trim());
  const start = await theme();
  const limeStart = await lime();
  await page.locator('#theme').click();
  expect(await theme()).not.toBe(start);
  expect(await lime()).not.toBe(limeStart);
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(await theme());
  await page.reload({ waitUntil: 'networkidle' });
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(await theme());
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe(await theme() === 'light' ? 'rgb(245, 242, 251)' : 'rgb(10, 11, 10)');
});

test('hire path: pipeline typed line runs and the story advances through its panels', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/terminal/#hire', { waitUntil: 'networkidle' });
  await scrollStory(page, 'story-hire', 0.05);
  await page.waitForTimeout(1200);
  expect((await page.locator('#story-hire [data-typed-text]').textContent()).length).toBeGreaterThan(0);
  await scrollStory(page, 'story-hire', 0.5);
  await expect(page.locator('#story-hire [data-panel]').nth(1)).toHaveClass(/on/);
  await scrollStory(page, 'story-hire', 1);
  await expect(page.locator('#story-hire [data-panel]').nth(2)).toHaveClass(/on/);
  expect(errors).toEqual([]);
});

test('reduced motion: stories are static and every panel is readable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = trackErrors(page);
  await page.goto('/terminal/#hire', { waitUntil: 'networkidle' });
  await expect(page.locator('#story-hero')).toHaveClass(/static/);
  await expect(page.locator('#story-hire')).toHaveClass(/static/);
  const inert = await page.locator('#story-hire [data-panel][inert]').count();
  expect(inert).toBe(0);
  await expect(page.locator('#story-hire [data-typed-text]')).not.toHaveText('');
  expect(errors).toEqual([]);
});

test('mobile 390x844: no horizontal overflow on hero, hire and ministry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hash of ['', '#hire', '#ministry']) {
    await page.goto('/terminal/' + hash, { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), hash).toBe(false);
  }
});

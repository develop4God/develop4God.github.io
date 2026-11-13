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

test('auto: with no input at all the hero moves on to the fork by itself and holds there', async ({ page }) => {
  test.setTimeout(45_000);
  const errors = trackErrors(page);
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  const panels = page.locator('#story-hero [data-panel]');
  await expect(panels.nth(0)).toHaveClass(/on/);
  await expect(panels.nth(1)).toHaveAttribute('inert', '');
  await expect(panels.nth(1)).toHaveClass(/on/, { timeout: 9000 });
  await expect(panels.nth(1)).not.toHaveAttribute('inert', '');
  await expect(panels.nth(0)).toHaveAttribute('inert', '');
  await page.waitForTimeout(8000);
  await expect(panels.nth(1)).toHaveClass(/on/);
  expect(errors).toEqual([]);
});

test('skip: wheel, key and tap each move the hero to the fork immediately', async ({ page }) => {
  for (const act of [
    (p) => p.mouse.wheel(0, 100),
    (p) => p.keyboard.press('ArrowDown'),
    (p) => p.evaluate(() => window.dispatchEvent(new Event('touchstart')))
  ]) {
    await page.goto('/terminal/', { waitUntil: 'networkidle' });
    await expect(page.locator('#story-hero [data-panel]').nth(0)).toHaveClass(/on/);
    await act(page);
    await expect(page.locator('#story-hero [data-panel]').nth(1)).toHaveClass(/on/, { timeout: 1500 });
  }
});

test('dots are buttons with labels and jump to their scene', async ({ page }) => {
  await page.goto('/terminal/#hire', { waitUntil: 'networkidle' });
  const dots = page.locator('#story-hire .dot');
  await expect(dots).toHaveCount(3);
  await expect(dots.nth(0)).toHaveAttribute('aria-label', 'Scene 1');
  await dots.nth(2).click();
  await expect(page.locator('#story-hire [data-panel]').nth(2)).toHaveClass(/on/);
  await expect(dots.nth(2)).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#story-hire [data-panel]').nth(0)).toHaveAttribute('inert', '');
});

test('choosing Hire me reveals only that path; switch link flips to Ministry', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  await page.mouse.wheel(0, 100);
  await expect(page.locator('#story-hero [data-panel]').nth(1)).toHaveClass(/on/);
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

test('auto: the hire path advances through its scenes on its own and loops', async ({ page }) => {
  test.setTimeout(45_000);
  const errors = trackErrors(page);
  await page.goto('/terminal/#hire', { waitUntil: 'networkidle' });
  const panels = page.locator('#story-hire [data-panel]');
  await expect(panels.nth(0)).toHaveClass(/on/);
  await page.waitForTimeout(1500);
  expect((await page.locator('#story-hire [data-typed-text]').textContent()).length).toBeGreaterThan(0);
  await expect(panels.nth(1)).toHaveClass(/on/, { timeout: 9000 });
  await expect(panels.nth(2)).toHaveClass(/on/, { timeout: 9000 });
  await expect(panels.nth(0)).toHaveClass(/on/, { timeout: 9000 });
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

test('deep link #ministry scrolls to the ministry path, and hashchange opens the other path', async ({ page }) => {
  await page.goto('/terminal/#ministry', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  const top = await page.evaluate(() => document.getElementById('path-ministry').getBoundingClientRect().top);
  expect(Math.abs(top)).toBeLessThan(120);
  await page.evaluate(() => { window.location.hash = '#hire'; });
  await expect(page.locator('#path-hire')).toBeVisible();
  await expect(page.locator('#path-ministry')).toBeHidden();
});

test('reduced motion: canvas bitmap keeps the aspect ratio of its box (no squashed shapes)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  const ratio = await page.evaluate(() => {
    const c = document.querySelector('#story-hero .scene'), r = c.getBoundingClientRect();
    return { box: r.width / r.height, bitmap: c.width / c.height };
  });
  expect(Math.abs(ratio.box - ratio.bitmap)).toBeLessThan(0.02);
});

test('switching language keeps already revealed case rows visible', async ({ page }) => {
  await page.goto('/terminal/#hire', { waitUntil: 'networkidle' });
  await page.locator('#cases').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const before = await page.locator('#cases .case.in').count();
  expect(before).toBeGreaterThan(0);
  await page.locator('button[data-lang="es"]').click();
  await expect(page.locator('#cases .case h3').first()).not.toHaveText('');
  expect(await page.locator('#cases .case.in').count()).toBe(before);
});

test('rapid language switches end on the last choice', async ({ page }) => {
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.querySelector('button[data-lang="es"]').click();
    document.querySelector('button[data-lang="en"]').click();
  });
  await page.waitForTimeout(800);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#story-hero .verse')).toHaveText(EN_VERSE);
  expect(await page.evaluate(() => localStorage.getItem('develop4God_language'))).toBe('en');
});

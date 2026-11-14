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
  await expect(page.locator('#story-hero [data-i18n="hero.ref"]')).toContainText('Colossians 3:23');
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
  await expect(panels.nth(1)).toHaveClass(/on/, { timeout: 13000 });
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
    await expect(page.locator('#story-hero [data-panel]').nth(1)).toHaveClass(/on/, { timeout: 3500 });
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

test('ministry stats count up from zero even when app-stats.json arrives after they are visible, and replay on click', async ({ page, request }) => {
  const stats = await (await request.get('/data/app-stats.json')).json();
  await page.route('**/data/app-stats.json', async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.continue(); });
  await page.goto('/terminal/#ministry', { waitUntil: 'domcontentloaded' });
  const el = page.locator('[data-app-stat="activeUsers"]');
  await expect(el).toHaveText(/^\d/, { timeout: 5000 });
  const seen = [];
  for (let i = 0; i < 12; i++) { seen.push(await el.textContent()); await page.waitForTimeout(80); }
  expect(seen.some((v) => v !== stats.activeUsers), `never animated, saw ${seen.join(' | ')}`).toBe(true);
  await expect(el).toHaveText(stats.activeUsers, { timeout: 3000 });
  await page.locator('.stats').click();
  await page.waitForTimeout(250);
  expect(await el.textContent()).not.toBe(stats.activeUsers);
  await expect(el).toHaveText(stats.activeUsers, { timeout: 3000 });
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

test('auto: a resting mouse over the hero does not stop it advancing to the fork', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  await page.mouse.move(640, 360);
  await expect(page.locator('#story-hero [data-panel]').nth(1)).toHaveClass(/on/, { timeout: 13000 });
});

test('auto: a tap on the hero does not freeze it (touch pointer stays "inside")', async ({ browser }) => {
  test.setTimeout(45_000);
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8791/terminal/', { waitUntil: 'networkidle' });
  await page.locator('#story-hero .pin').tap({ position: { x: 40, y: 60 } });
  await expect(page.locator('#story-hero [data-panel]').nth(1)).toHaveClass(/on/, { timeout: 13000 });
  await ctx.close();
});

test('auto: hovering the hire story does not stop its scenes; the pause button does', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/terminal/#hire', { waitUntil: 'networkidle' });
  await page.mouse.move(640, 400);
  const panels = page.locator('#story-hire [data-panel]');
  await expect(panels.nth(1)).toHaveClass(/on/, { timeout: 10000 });
  const pause = page.locator('#story-hire .pause');
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(8500);
  await expect(panels.nth(1)).toHaveClass(/on/);
  await pause.click();
  await expect(panels.nth(2)).toHaveClass(/on/, { timeout: 10000 });
});

test('contact opens the mail app: a mailto link, no copy button', async ({ page }) => {
  await page.goto('/terminal/#contact', { waitUntil: 'networkidle' });
  const link = page.locator('#contact a.mailto');
  await expect(link).toBeVisible();
  expect(await link.getAttribute('href')).toMatch(/^mailto:develop4God@gmail\.com/);
  await expect(page.locator('#contact #copy')).toHaveCount(0);
  await page.locator('button[data-lang="es"]').click();
  await expect(link).not.toHaveText('');
});

test('light theme: the hero logo stays dark and solid enough to read on the pale background', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  const stats = () => page.evaluate(() => {
    const c = document.querySelector('#story-hero .scene'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0, lum = 0, alpha = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { n++; alpha += d[i + 3]; lum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); }
    return { n, meanAlpha: alpha / n, meanLum: lum / n };
  });
  // Stage 1, mid build-up: the dense true-colour dots flying in (the same colours as the logo).
  await page.waitForTimeout(1500);
  const dots = await stats();
  expect(dots.n).toBeGreaterThan(500);
  expect(dots.meanAlpha).toBeGreaterThan(150);
  expect(dots.meanLum).toBeLessThan(140);
  // Stage 2, the settled real logo image (gold and white sparkles lift its mean luminance a little).
  await page.waitForTimeout(4000);
  const logo = await stats();
  expect(logo.n).toBeGreaterThan(500);
  expect(logo.meanAlpha).toBeGreaterThan(170);
  expect(logo.meanLum).toBeLessThan(140);
});

for (const [w, h] of [[1234, 590], [1280, 720], [390, 844], [844, 390]]) {
  test(`fork spheres never reach the heading text at ${w}x${h}`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/terminal/', { waitUntil: 'networkidle' });
    await page.locator('#story-hero .dot').nth(1).click();
    await page.waitForTimeout(4500);
    const r = await page.evaluate(() => {
      const c = document.querySelector('#story-hero .scene'), cr = c.getBoundingClientRect(), k = c.width / cr.width;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let lowest = 0;
      for (let y = c.height - 1; y >= 0 && !lowest; y--) for (let x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 40) { lowest = y; break; }
      const eyebrow = document.querySelector('#story-hero .doorpanel .eyebrow').getBoundingClientRect();
      return { dotsBottom: lowest / k, textTop: eyebrow.top - cr.top };
    });
    expect(r.dotsBottom).toBeLessThanOrEqual(r.textTop + 2);
  });
}

test('ministry mission shows the Isaiah 55 text in each language, under the mission title', async ({ page }) => {
  await page.goto('/terminal/#ministry', { waitUntil: 'networkidle' });
  const q = page.locator('#ministries .isaiah');
  await expect(q).toBeVisible();
  await expect(q.locator('p')).toContainText('my word');
  await expect(q.locator('cite')).toContainText('Isaiah 55:10-11');
  await page.locator('button[data-lang="es"]').click();
  await expect(q.locator('p')).toContainText('mi palabra');
  await expect(q.locator('cite')).toContainText('Isaías 55:10-11');
  await expect(page.locator('#ministries .t')).toHaveText('Nuestra misión');
});

test('fork spheres: the sphere of the hovered door grows (hire = green, ministry = gold)', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/terminal/', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#story-hero [data-panel]').nth(1)).toHaveClass(/on/, { timeout: 5000 });
  await page.waitForTimeout(3500);
  const widths = () => page.evaluate(() => {
    const c = document.querySelector('#story-hero .scene'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, w = c.width;
    const box = { green: [1e9, -1e9], gold: [1e9, -1e9] };
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 120) continue;
      const k = d[i + 1] > d[i] + 8 && d[i + 1] > d[i + 2] + 8 ? 'green' : d[i] > d[i + 1] + 20 && d[i] > d[i + 2] + 20 ? 'gold' : null;
      if (!k) continue;
      const x = (i / 4) % w;
      if (x < box[k][0]) box[k][0] = x;
      if (x > box[k][1]) box[k][1] = x;
    }
    return { green: box.green[1] - box.green[0], gold: box.gold[1] - box.gold[0] };
  });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(900);
  // The idle sway and breathing change the size over about 6 s, so the baseline is the largest
  // width over a full cycle; a hovered sphere must beat even that.
  const base = { green: 0, gold: 0 };
  for (let i = 0; i < 9; i++) {
    const w = await widths();
    base.green = Math.max(base.green, w.green);
    base.gold = Math.max(base.gold, w.gold);
    await page.waitForTimeout(700);
  }
  await page.hover('#story-hero .door.hire');
  await page.waitForTimeout(1000);
  const hire = await widths();
  await page.hover('#story-hero .door.min');
  await page.waitForTimeout(1000);
  const min = await widths();
  expect(hire.green / base.green).toBeGreaterThan(1.01);
  expect(hire.gold / base.gold).toBeLessThan(1.01);
  expect(min.gold / base.gold).toBeGreaterThan(1.01);
  expect(min.green / base.green).toBeLessThan(1.01);
});

test('language counts in the text come from app-stats.json, so a changed stat changes the text', async ({ page }) => {
  const stats = { downloads: '22K+', rating: '4.9', ratingDisplay: '4.9 ★', countries: '100+', activeUsers: '7,800+', languages: '12' };
  await page.route('**/data/app-stats.json', (route) => route.fulfill({ json: stats }));
  await page.goto('/terminal/?lang=en#ministry', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-i18n="min.apps.dev.text"]')).toContainText('in 12 languages');
  await expect(page.locator('[data-i18n="story.languages.title"]')).toHaveText('12 languages, with systems that review them.');
  await page.goto('/terminal/?lang=es#ministry', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-i18n="min.apps.dev.text"]')).toContainText('en 12 idiomas');
});

test('language counts keep a number-free text when app-stats.json cannot load', async ({ page }) => {
  await page.route('**/data/app-stats.json', (route) => route.abort());
  await page.goto('/terminal/?lang=en#ministry', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-i18n="story.languages.title"]')).toHaveText('Multiple languages, with systems that review them.');
});

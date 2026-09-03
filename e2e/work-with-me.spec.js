// Smoke coverage for the work-with-me page (work-with-me/index.html).
// Exercises real UI state: content renders, theme toggle actually flips
// the theme, contact CTAs point at the right destinations, no console errors.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

test('work-with-me page loads and is interactive', async ({ page }) => {
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('/work-with-me/', { waitUntil: 'networkidle' });

  const h1 = page.locator('h1').first();
  await expect(h1).not.toHaveText('');

  const emailLink = page.locator('a[href^="mailto:"]').first();
  await expect(emailLink).toBeVisible();

  const whatsappLink = page.locator('a[href^="https://wa.me/"]').first();
  await expect(whatsappLink).toBeVisible();
  await expect(whatsappLink).toHaveAttribute('href', 'https://wa.me/50688424291');

  const devocionalesLink = page.locator('a[href="/devocionales/"]');
  await expect(devocionalesLink.first()).toBeVisible();

  const habitusLink = page.locator('a[href="/habitus/"]');
  await expect(habitusLink.first()).toBeVisible();

  const themeToggle = page.locator('#theme-toggle');
  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.locator('label.theme-switch').click();
  await expect(themeToggle).toBeChecked();
  const themeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(themeAfter).not.toBe(themeBefore);

  expect(consoleErrors).toEqual([]);
});

test('work-with-me page has no horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/work-with-me/', { waitUntil: 'networkidle' });

  const hasOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
  expect(hasOverflow).toBe(false);
});

test('work-with-me language switcher changes visible text (switch to English, then Portuguese)', async ({ page }) => {
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('/work-with-me/', { waitUntil: 'networkidle' });

  const h1 = page.locator('h1').first();

  await page.locator('.language-selector-button').click();
  await page.locator('.language-option[data-lang="en"]').click();
  await page.waitForTimeout(300);
  const englishText = await h1.textContent();
  expect(englishText.toLowerCase()).toContain('ministries');

  await page.locator('.language-selector-button').click();
  await page.locator('.language-option[data-lang="pt"]').click();
  await page.waitForTimeout(300);
  const portugueseText = await h1.textContent();
  expect(portugueseText).not.toBe(englishText);
  expect(portugueseText.toLowerCase()).toContain('ministérios');

  expect(consoleErrors).toEqual([]);
});

test('work-with-me language switcher updates footer shared lines from live translations', async ({ page }) => {
  await page.goto('/work-with-me/', { waitUntil: 'networkidle' });

  const footer = page.locator('#page-footer');
  const beforeText = await footer.textContent();

  await page.locator('.language-selector-button').click();
  await page.locator('.language-option[data-lang="pt"]').click();
  await page.waitForTimeout(300);

  const afterText = await footer.textContent();
  expect(afterText).not.toBe(beforeText);
  expect(afterText).toContain('Todos os direitos reservados');
});

test('work-with-me Arabic sets dir="rtl" on <html>', async ({ page }) => {
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('/work-with-me/', { waitUntil: 'networkidle' });

  await page.locator('.language-selector-button').click();
  await page.locator('.language-option[data-lang="ar"]').click();
  await page.waitForTimeout(300);

  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
  expect(dir).toBe('rtl');

  expect(consoleErrors).toEqual([]);
});

test('work-with-me language choice persists across reload via the shared localStorage key', async ({ page }) => {
  await page.goto('/work-with-me/', { waitUntil: 'networkidle' });

  await page.locator('.language-selector-button').click();
  await page.locator('.language-option[data-lang="fr"]').click();
  await page.waitForTimeout(300);

  const storedLang = await page.evaluate(() => localStorage.getItem('develop4God_language'));
  expect(storedLang).toBe('fr');

  await page.reload({ waitUntil: 'networkidle' });

  const h1 = page.locator('h1').first();
  const text = await h1.textContent();
  expect(text.toLowerCase()).toContain('ministères');

  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
  expect(dir).toBe('ltr');
});

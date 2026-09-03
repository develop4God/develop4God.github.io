// Smoke coverage for the redesigned home page (index.html).
// Exercises real UI state: content renders, theme toggle actually flips
// the theme, the custom language dropdown opens/switches language, nav
// links point to the right destinations, no console errors.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

test('home page loads and is interactive', async ({ page }) => {
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('/', { waitUntil: 'networkidle' });

  const h1 = page.locator('h1').first();
  await expect(h1).not.toHaveText('');

  const devocionalesLink = page.locator('a[href="/devocionales/"]');
  await expect(devocionalesLink.first()).toBeVisible();

  const habitusLink = page.locator('a[href="/habitus/"]');
  await expect(habitusLink.first()).toBeVisible();

  const workWithMeLink = page.locator('a[href="/work-with-me/"]');
  await expect(workWithMeLink.first()).toBeVisible();

  const themeToggle = page.locator('#theme-toggle');
  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.locator('label.theme-switch').click();
  await expect(themeToggle).toBeChecked();
  const themeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  expect(themeAfter).not.toBe(themeBefore);

  expect(consoleErrors).toEqual([]);
});

test('home page language dropdown switches language', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const button = page.locator('.language-selector-button');
  await expect(button).toBeVisible();
  await button.click();

  const dropdown = page.locator('.language-dropdown');
  await expect(dropdown).toHaveClass(/opacity-100/);

  const enOption = page.locator('.language-option[data-lang="en"]');
  await enOption.click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.language-current')).toContainText('English');
});

test('home page has no horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/', { waitUntil: 'networkidle' });

  const hasOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
  expect(hasOverflow).toBe(false);
});

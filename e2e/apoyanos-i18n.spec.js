// Apóyanos page language: the browser language (or the saved choice) picks /lang/apoyanos/{lang}.json,
// and anything unsupported or unreachable ends on a readable page.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const PAGE = '/apoyanos/';
const SHARED_LANGUAGE_KEY = 'develop4God_language';

test.describe('Apóyanos page language', () => {
  test.describe('English browser', () => {
    test.use({ locale: 'en-US' });

    test('renders English text, title and html lang', async ({ page }) => {
      await page.goto(PAGE);
      await expect(page.locator('h1')).toHaveText('Support us');
      await expect(page).toHaveTitle('Support us');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('footer')).toHaveText('Develop4God · Christian Devotionals');
      await expect(page.locator('.hero .btn-primary')).toHaveText('I want to support');
      await expect(page.locator('#sticky .btn-primary')).toHaveText('I want to support');
    });

    test('keeps the links inside the sentences that hold them, in the translated word order', async ({ page }) => {
      await page.goto(PAGE);
      const transfer = page.locator('p[data-i18n="give.transfer"]');
      await expect(transfer).toHaveText('Prefer a bank transfer or another way? Message us on WhatsApp and we will send you the details.');
      await expect(transfer.locator('a')).toHaveAttribute('href', 'https://wa.me/50688424291');
      const unlock = page.locator('p[data-i18n="give.unlock"]');
      await expect(unlock).toContainText('Unlock Encounters: unlocking is done from the Encounters page');
      await expect(unlock.locator('strong')).toHaveText('Unlock Encounters:');
      await expect(unlock.locator('a')).toHaveAttribute('href', '/devocionales/encounters/');
    });

    test('translates attributes and leaves the numbers and the progress bars alone', async ({ page }) => {
      await page.goto(PAGE);
      await expect(page.locator('#yappy-btn')).toHaveAttribute('aria-label', 'Yappy, Panama: tap to copy the number');
      await expect(page.locator('[role="group"]').first()).toHaveAttribute('aria-label', 'Frequency');
      await expect(page.locator('#total-count')).toHaveAttribute('data-target', '74.15');
      await expect(page.locator('.goal-price').nth(1)).toHaveText('$3,199');
    });

    test('script messages are English: an invalid amount, and the Yappy failure', async ({ page }) => {
      await page.route('**/api/yappy', (route) => route.abort());
      await page.goto(PAGE);
      await page.getByRole('button', { name: 'Other' }).click();
      await page.locator('#other-amount').fill('0.5');
      await expect(page.locator('#sdk-status')).toHaveText('Enter an amount of $1 or more, with up to two decimals.');
      await page.locator('#yappy-btn').click();
      await expect(page.locator('#yappy-label')).toHaveText('We could not load the number. Message us on WhatsApp and we will give it to you.');
    });
  });

  test.describe('Spanish browser', () => {
    test.use({ locale: 'es-PA' });

    test('renders the Spanish copy from es.json with the same links', async ({ page }) => {
      await page.goto(PAGE);
      await expect(page.locator('h1')).toHaveText('Apóyanos');
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      await expect(page.locator('p[data-i18n="give.transfer"]')).toHaveText('¿Prefieres transferencia u otro medio? Escríbenos por WhatsApp y te damos los datos.');
      await expect(page.locator('p[data-i18n="give.unlock"] a')).toHaveAttribute('href', '/devocionales/encounters/');
    });

    test('a saved language wins over the browser language', async ({ page }) => {
      await page.addInitScript((key) => localStorage.setItem(key, 'en'), SHARED_LANGUAGE_KEY);
      await page.goto(PAGE);
      await expect(page.locator('h1')).toHaveText('Support us');
    });
  });

  test.describe('unsupported browser language', () => {
    test.use({ locale: 'fr-FR' });

    test('falls back to English', async ({ page }) => {
      await page.goto(PAGE);
      await expect(page.locator('h1')).toHaveText('Support us');
    });

    test('a saved language without a file (shared key from another section) is ignored', async ({ page }) => {
      await page.addInitScript((key) => localStorage.setItem(key, 'ja'), SHARED_LANGUAGE_KEY);
      await page.goto(PAGE);
      await expect(page.locator('h1')).toHaveText('Support us');
    });
  });

  test.describe('translation files unreachable', () => {
    test.use({ locale: 'en-US' });

    test('English missing: the page falls back to Spanish and says so in html lang', async ({ page }) => {
      await page.route('**/lang/apoyanos/en.json', (route) => route.abort());
      await page.goto(PAGE);
      await expect(page.locator('h1')).toHaveText('Apóyanos');
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    });

    test('every file missing: the Spanish markup stays and the page does not break', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/lang/apoyanos/*.json', (route) => route.fulfill({ status: 404, body: '' }));
      await page.goto(PAGE);
      await expect(page.locator('h1')).toHaveText('Apóyanos');
      await expect(page.locator('.hero .btn-primary')).toHaveText('Quiero apoyar');
      await page.getByRole('button', { name: 'Otro' }).click();
      expect(errors).toEqual([]);
    });
  });

  test.describe('replay: a cached page from before the i18n script existed', () => {
    test.use({ locale: 'es-PA' });

    // The new donate.js is served with older HTML that has no apoyanos-i18n.js tag: giving must still work.
    test('donate.js loads the i18n script itself and the donation messages are real text', async ({ page }) => {
      const { readFileSync } = require('node:fs');
      const html = readFileSync(require('node:path').join(__dirname, '..', 'apoyanos', 'index.html'), 'utf8')
        .replace('<script src="/apoyanos/js/apoyanos-i18n.js"></script>\n', '');
      expect(html).not.toContain('apoyanos-i18n.js');
      await page.route('**/apoyanos/', (route) => route.fulfill({ contentType: 'text/html', body: html }));
      await page.route(/paypal\.com\/sdk/, (route) => route.abort());
      await page.goto(PAGE);
      await page.locator('#dar').scrollIntoViewIfNeeded();
      await expect(page.locator('#sdk-status')).toHaveText('No se pudo cargar PayPal. Puedes dar con el enlace de PayPal de abajo.');
      await expect(page.locator('#once-link')).toBeVisible();
    });
  });

  test.describe('i18n script blocked', () => {
    test.use({ locale: 'es-PA' });

    test('the page content stays visible and the Spanish markup is shown', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/apoyanos/js/apoyanos-i18n.js', (route) => route.abort());
      await page.goto(PAGE);
      await expect(page.locator('h1')).toHaveText('Apóyanos');
      await page.locator('#dar').scrollIntoViewIfNeeded();
      await expect(page.locator('#dar')).toHaveCSS('opacity', '1');
      await expect(page.locator('#yappy-btn')).toBeEnabled();
      expect(errors).toEqual([]);
    });
  });
});

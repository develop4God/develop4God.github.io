// Apoyanos Yappy button: one tap fetches the number from /api/yappy and shows it. The endpoint is stubbed,
// so the spec never needs the real number.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const PAGE = '/apoyanos/';
const FAKE_NUMBER = '+507 6000-0000';

test.describe('Apoyanos Yappy', () => {
  test.use({ locale: 'es-PA' }); // these specs assert the Spanish copy
  test('one tap copies the number and says so without showing it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.route('**/api/yappy', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ number: FAKE_NUMBER }) }));
    await page.goto(PAGE);

    await expect(page.locator('#yappy-box')).toBeHidden();
    await page.locator('#yappy-btn').click();

    await expect(page.locator('#yappy-label')).toHaveText('Número copiado. Pégalo en la aplicación Yappy.');
    await expect(page.locator('#yappy-row')).toBeHidden();
    await expect(page.locator('body')).not.toContainText(FAKE_NUMBER);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(FAKE_NUMBER);
  });

  test('when the clipboard is blocked the number is shown with a Copiar button', async ({ page }) => {
    await page.route('**/api/yappy', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ number: FAKE_NUMBER }) }));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { write: () => Promise.reject(new Error('blocked')), writeText: () => Promise.reject(new Error('blocked')) } });
    });
    await page.goto(PAGE);
    await page.locator('#yappy-btn').click();

    await expect(page.locator('#yappy-number')).toHaveText(FAKE_NUMBER);
    await expect(page.locator('#yappy-label')).toContainText('Toca Copiar y pégalo en la aplicación Yappy');
    await expect(page.locator('#yappy-copy')).toBeVisible();
  });

  test('the number is not in the page HTML', async ({ page }) => {
    const html = await (await page.request.get(PAGE)).text();
    expect(html).not.toContain(FAKE_NUMBER);
  });

  test('falls back to WhatsApp when the endpoint is missing (HTML answer, 200)', async ({ page }) => {
    await page.route('**/api/yappy', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html>spa</html>' }));
    await page.goto(PAGE);
    await page.locator('#yappy-btn').click();

    await expect(page.locator('#yappy-label')).toContainText('WhatsApp');
    await expect(page.locator('#yappy-row')).toBeHidden();
  });

  test('falls back to WhatsApp on a 404', async ({ page }) => {
    await page.route('**/api/yappy', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not-configured"}' }));
    await page.goto(PAGE);
    await page.locator('#yappy-btn').click();

    await expect(page.locator('#yappy-label')).toContainText('WhatsApp');
    await expect(page.locator('#yappy-row')).toBeHidden();
  });

  test('rejects a payload that does not look like a number', async ({ page }) => {
    await page.route('**/api/yappy', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ number: '<img src=x onerror=alert(1)>' }) }));
    await page.goto(PAGE);
    await page.locator('#yappy-btn').click();

    await expect(page.locator('#yappy-label')).toContainText('WhatsApp');
    await expect(page.locator('#yappy-row')).toBeHidden();
  });

  test('a browser whose ClipboardItem throws still shows the number to copy by hand', async ({ page }) => {
    await page.route('**/api/yappy', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ number: FAKE_NUMBER }) }));
    await page.addInitScript(() => {
      window.ClipboardItem = function ClipboardItem() { throw new Error('promise values unsupported'); };
      Object.defineProperty(navigator, 'clipboard', { value: { write: () => Promise.resolve(), writeText: () => Promise.reject(new Error('blocked')) } });
    });
    await page.goto(PAGE);
    await page.locator('#yappy-btn').click();
    await expect(page.locator('#yappy-number')).toHaveText(FAKE_NUMBER);
    await expect(page.locator('#yappy-copy')).toBeVisible();
  });
});

// The Apóyanos page with the PayPal SDK stubbed, so the spec runs offline and never reaches paypal.com.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const SDK_PATTERN = /^https:\/\/www\.paypal\.com\/sdk\/js/;

const FAKE_SDK = `
window.paypal = {
  Buttons: function (options) {
    window.__subscriptionPlans = (window.__subscriptionPlans || []).concat([options.createSubscription ? 'yes' : 'no']);
    return { render: function () { return Promise.resolve(); } };
  }
};`;

function stubSdk(page) {
  const requests = [];
  page.route(SDK_PATTERN, (route) => {
    requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SDK });
  });
  return requests;
}

test.describe('Apóyanos page', () => {
  test('one-time is the default and links to PayPal.me with the selected amount', async ({ page }) => {
    stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#once-link')).toHaveAttribute('href', /paypalme\/develop4godOfficial\/10USD$/);
  });

  test('choosing a preset amount updates the one-time link', async ({ page }) => {
    stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '$25' }).click();
    await expect(page.locator('#once-link')).toHaveAttribute('href', /25USD$/);
  });

  test('"Otro" shows a custom amount field that drives the one-time link', async ({ page }) => {
    stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Otro' }).click();
    await expect(page.locator('#other-box')).toBeVisible();
    await page.fill('#other-amount', '42.5');
    await expect(page.locator('#once-link')).toHaveAttribute('href', /42\.5USD$/);
  });

  test('choosing monthly shows only the subscribe button for the selected amount', async ({ page }) => {
    stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Mensual' }).click();
    await page.getByRole('button', { name: '$25' }).click();
    const visible = page.locator('.plan-slot.visible');
    await expect(visible).toHaveCount(1);
    await expect(visible).toHaveAttribute('data-plan', 'P-35R67290FY745831SNMALS2Q');
    await expect(page.locator('#once-link')).toBeHidden();
  });

  test('yearly shows the yearly plan for the selected amount', async ({ page }) => {
    stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Anual' }).click();
    await page.getByRole('button', { name: '$5' }).click();
    await expect(page.locator('.plan-slot.visible')).toHaveAttribute('data-plan', 'P-0LF0259858521293SNMALTTQ');
  });

  test('the SDK loads with the subscription intent so the recurring buttons can render', async ({ page }) => {
    const requests = stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => (window.__subscriptionPlans || []).length)).toBe(6);
    const url = new URL(requests[0]);
    expect(url.searchParams.get('intent')).toBe('subscription');
    expect(url.searchParams.get('vault')).toBe('true');
  });

  test('the Encounters unlock option links to the Encounters page', async ({ page }) => {
    stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'Desbloquear Encuentros' })).toHaveAttribute('href', '/devocionales/encounters/');
  });

  test('"Otro" with a recurring frequency explains that recurring amounts are fixed', async ({ page }) => {
    stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Mensual' }).click();
    await page.getByRole('button', { name: 'Otro' }).click();
    await expect(page.locator('#sdk-status')).toContainText('montos fijos');
  });
});

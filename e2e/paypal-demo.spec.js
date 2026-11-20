// Runs the PayPal demo with the SDK stubbed, so the spec works offline and never reaches paypal.com.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const SDK_PATTERN = /^https:\/\/www\.paypal\.com\/sdk\/js/;
const PLACEHOLDER = 'REPLACE_WITH_SANDBOX_CLIENT_ID';

// A stand-in for the PayPal SDK: it records the options handed to Buttons and the container it renders into.
const FAKE_SDK = `
window.paypal = {
  Buttons: function (options) {
    window.__paypalOptions = options;
    return { render: function (container) { window.__renderedInto = container.id; return Promise.resolve(); } };
  }
};`;

// Serves the demo with the given client id in place of the placeholder, so the page reads it at load time.
async function openDemo(page, clientId) {
  await page.route('**/paypal-demo/', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(/data-client-id="[^"]*"/, `data-client-id="${clientId}"`);
    await route.fulfill({ response, body: html });
  });
  await page.goto('/paypal-demo/', { waitUntil: 'domcontentloaded' });
}

function stubSdk(page, { abort = false } = {}) {
  const requests = [];
  page.route(SDK_PATTERN, (route) => {
    requests.push(route.request().url());
    if (abort) return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SDK });
  });
  return requests;
}

test.describe('PayPal demo page', () => {
  test('without a client id it shows a warning and never requests the SDK', async ({ page }) => {
    const requests = stubSdk(page);
    await openDemo(page, PLACEHOLDER);
    await expect(page.locator('#status')).toContainText('Set data-client-id');
    await expect(page.locator('#status')).toHaveClass(/warning/);
    expect(requests).toEqual([]);
  });

  test('with a client id it loads the SDK for USD capture and renders into the container', async ({ page }) => {
    const requests = stubSdk(page);
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await openDemo(page, 'sandbox-test-id');

    await expect.poll(() => page.evaluate(() => window.__renderedInto)).toBe('paypal-button-container');
    expect(requests.length).toBe(1);
    const url = new URL(requests[0]);
    expect(url.searchParams.get('client-id')).toBe('sandbox-test-id');
    expect(url.searchParams.get('currency')).toBe('USD');
    expect(url.searchParams.get('intent')).toBe('capture');
    expect(pageErrors).toEqual([]);
  });

  test('an approved payment shows the completed status', async ({ page }) => {
    stubSdk(page);
    await openDemo(page, 'sandbox-test-id');
    await page.waitForFunction(() => window.__paypalOptions);
    await page.evaluate(() => window.__paypalOptions.onApprove(null, {
      order: { capture: () => Promise.resolve({ status: 'COMPLETED' }) },
    }));
    await expect(page.locator('#status')).toHaveText('Payment completed. Status: COMPLETED');
  });

  test('a failed SDK load shows an error instead of an empty page', async ({ page }) => {
    stubSdk(page, { abort: true });
    await openDemo(page, 'sandbox-test-id');
    await expect(page.locator('#status')).toContainText('Could not load the PayPal SDK');
  });
});

test.describe('PayPal demo page, subscription mode', () => {
  test('loads the SDK for subscriptions and renders a subscribe button for each plan', async ({ page }) => {
    const requests = stubSdk(page);
    await page.route(/paypal-demo\/(\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace(/data-client-id="[^"]*"/, 'data-client-id="sandbox-test-id"');
      await route.fulfill({ response, body: html });
    });
    await page.goto('/paypal-demo/?mode=subscription', { waitUntil: 'domcontentloaded' });

    await expect.poll(() => page.evaluate(() => window.__renderedInto !== undefined || window.__paypalOptions !== undefined)).toBe(true);
    const url = new URL(requests[0]);
    expect(url.searchParams.get('intent')).toBe('subscription');
    expect(url.searchParams.get('vault')).toBe('true');
    await expect(page.locator('.plan-slot')).toHaveCount(6);
    await expect(page.locator('.plan-slot').first()).toContainText('Monthly 5 USD');
  });
});

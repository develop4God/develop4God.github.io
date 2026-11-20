// Encounters unlock by PayPal (web, this browser): the sheet's button loads the SDK only when the sheet
// opens, a COMPLETED capture opens every card, and anything else keeps the lock. The PayPal SDK is a stub
// that records the options handed to Buttons, so no real payment is made and paypal.com is never reached.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const PAGE = '/devocionales/encounters/';
const INDEX_URL = /raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/encounters\/index\.json/;
const IMAGES = /raw\.githubusercontent\.com\/develop4God\/Devocionales-assets\/.*\/images\/encounters\//;
const SDK_URL = /^https:\/\/www\.paypal\.com\/sdk\/js/;
const CONFIG_URL = '**/devocionales/js/devotional-pwa-config.js';
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const KEY = 'develop4God_encounters_unlock_all';
const THANKS = 'Thank you for supporting our ministry';
const FAILED = 'The payment did not complete. Your encounters are still locked. Please try again.';

const entry = (id) => ({
  id, version: '1', status: 'published', emoji: '🌊', accent_color: '#1e3a5f', intro_image: `${id}_intro.png`,
  files: { en: `${id}_en.json` }, titles: { en: `Title ${id}` }, subtitles: { en: `Sub ${id}` },
  scripture_reference: { en: 'Matthew 14:22-33' }, estimated_reading_minutes: { en: 5 },
});
const INDEX = { encounters: [entry('a'), entry('b'), entry('c')] };

// The SDK stand-in: remembers the Buttons options and renders a marker into the container.
const FAKE_SDK = `
window.__sdkLoads = (window.__sdkLoads || 0) + 1;
window.paypal = {
  Buttons: function (options) {
    window.__paypalOptions = options;
    return { render: function (container) { container.setAttribute('data-rendered', 'yes'); return Promise.resolve(); } };
  }
};`;

async function mockData(page) {
  await page.route(INDEX_URL, (route) => route.fulfill({ json: INDEX }));
  await page.route(IMAGES, (route) => route.fulfill({ contentType: 'image/png', body: PNG_1X1 }));
}

// Serves the shipped config with the PayPal flag forced on or off, so each test states its own setting.
async function setUnlockEnabled(page, enabled) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'devocionales', 'js', 'devotional-pwa-config.js'), 'utf8');
  const pattern = /enabled: (true|false),(\s*clientId)/;
  if (!pattern.test(source)) throw new Error('encountersUnlock enabled flag not found in config');
  const body = source.replace(pattern, `enabled: ${enabled},$2`);
  await page.route(CONFIG_URL, (route) => route.fulfill({ contentType: 'application/javascript', body }));
}

// The client id in the shipped config, so the test follows the config and never hardcodes an id.
function shippedClientId() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'devocionales', 'js', 'devotional-pwa-config.js'), 'utf8');
  const match = /encountersUnlock[\s\S]*?clientId: '([^']+)'/.exec(source);
  if (!match) throw new Error('encountersUnlock clientId not found in config');
  return match[1];
}

function stubSdk(page) {
  const requests = [];
  page.route(SDK_URL, (route) => {
    requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SDK });
  });
  return requests;
}

async function seed(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('develop4God_language', 'en');
      localStorage.setItem('develop4God_encounters_welcome_seen', 'true');
    } catch (_) { /* storage blocked */ }
  });
}

async function openLockedSheet(page) {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-encounter-id="b"]')).toBeVisible();
  await page.locator('[data-encounter-id="b"]').click();
  await expect(page.locator('.encounter-sheet')).toBeVisible();
}

// Opens the sheet and taps the support button, which is what loads the PayPal buttons.
async function openCheckout(page) {
  await openLockedSheet(page);
  await page.locator('.encounter-sheet-support').click();
  await expect(page.locator('.encounter-paypal[data-rendered="yes"]')).toHaveCount(1);
}

test.describe('Encounters unlock by PayPal', () => {
  test('flag off (the shipped default): opening the sheet loads no PayPal script and shows no button', async ({ page }) => {
    await seed(page);
    await mockData(page);
    await setUnlockEnabled(page, false);
    const requests = stubSdk(page);
    await openLockedSheet(page);
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
    await expect(page.locator('.encounter-paypal')).toHaveCount(0);
    await expect(page.locator('.encounter-sheet-support')).toHaveCount(0);
    await expect(page.locator('.encounter-sheet-play')).toBeVisible();
  });

  test('flag on: the SDK is not requested on page load, only when the sheet opens', async ({ page }) => {
    await seed(page);
    await mockData(page);
    await setUnlockEnabled(page, true);
    const requests = stubSdk(page);
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-encounter-id="b"]')).toBeVisible();
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
    await page.locator('[data-encounter-id="b"]').click();
    await expect(page.locator('.encounter-sheet')).toBeVisible();
    // The support button replaces the Play link, priced in the reader's currency, and the SDK is still not requested.
    await expect(page.locator('.encounter-sheet-support')).toContainText('4.99');
    await expect(page.locator('.encounter-sheet-play')).toHaveCount(0);
    // Layout (like the app): the gold support button full width above "Keep reading in order".
    const supportBox = await page.locator('.encounter-sheet-support').boundingBox();
    const keepBox = await page.locator('.encounter-sheet-keep').boundingBox();
    expect(supportBox.y).toBeLessThan(keepBox.y);
    expect(supportBox.width).toBeGreaterThan(250);
    await page.waitForTimeout(200);
    expect(requests).toEqual([]);
    await page.locator('.encounter-sheet-support').click();
    await expect(page.locator('.encounter-paypal[data-rendered="yes"]')).toHaveCount(1);
    expect(requests.length).toBe(1);
    expect(requests[0]).toContain(`client-id=${shippedClientId()}`);
    expect(requests[0]).toContain('currency=USD');
  });

  test('a COMPLETED capture opens every card, shows the thank-you, closes the sheet and stores the flag', async ({ page }) => {
    await seed(page);
    await mockData(page);
    await setUnlockEnabled(page, true);
    stubSdk(page);
    await openCheckout(page);

    await page.evaluate(() => window.__paypalOptions.onApprove({}, {
      order: { capture: () => Promise.resolve({ status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ status: 'COMPLETED' }] } }] }) },
    }));

    await expect(page.locator('.encounter-sheet')).toHaveCount(0);
    await expect(page.locator('.encounter-pass')).toContainText(THANKS);
    await expect(page.locator('.encounter-pass')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('[data-encounter-id="b"]')).toHaveClass(/encounter-card--open/);
    await expect(page.locator('[data-encounter-id="c"]')).toHaveClass(/encounter-card--open/);
    await expect(page.locator('[data-encounter-id="c"]')).not.toHaveClass(/encounter-card--locked/);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('true');
  });

  test('a second approve after the grant does not grant or capture again', async ({ page }) => {
    await seed(page);
    await mockData(page);
    await setUnlockEnabled(page, true);
    stubSdk(page);
    await openCheckout(page);
    await page.evaluate(async () => {
      const actions = { order: { capture: () => Promise.resolve({ status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ status: 'COMPLETED' }] } }] }) } };
      await window.__paypalOptions.onApprove({}, actions);
      await window.__paypalOptions.onApprove({}, actions);
    });
    // The once-only grant is asserted by the unit test; here the page must still show the thank-you and store it.
    await expect(page.locator('.encounter-pass')).toContainText(THANKS);
    await expect(page.locator('.encounter-pass')).toHaveAttribute('role', 'dialog');
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe('true');
  });

  test('a capture that is not COMPLETED keeps the lock and shows the failure message', async ({ page }) => {
    await seed(page);
    await mockData(page);
    await setUnlockEnabled(page, true);
    stubSdk(page);
    await openCheckout(page);
    await page.evaluate(() => window.__paypalOptions.onApprove({}, {
      order: { capture: () => Promise.resolve({ status: 'PENDING' }) },
    }));
    await expect(page.locator('.toast')).toContainText(FAILED);
    await expect(page.locator('.encounter-sheet')).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  });

  test('an SDK that fails to load brings back the Play link and keeps the cards locked', async ({ page }) => {
    await seed(page);
    await mockData(page);
    await setUnlockEnabled(page, true);
    await page.route(SDK_URL, (route) => route.abort());
    await openLockedSheet(page);
    await page.locator('.encounter-sheet-support').click();
    await expect(page.locator('.encounter-sheet-play')).toBeVisible();
    await expect(page.locator('.encounter-paypal')).toHaveCount(0);
    await expect(page.locator('.encounter-sheet-keep')).toBeVisible();
    // The support button comes back, so the reader can retry once the SDK is reachable again.
    await expect(page.locator('.encounter-sheet-support')).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  });

  test('tapping support keeps focus inside the sheet, so Escape still closes it', async ({ page }) => {
    await seed(page);
    await mockData(page);
    await setUnlockEnabled(page, true);
    await stubSdk(page);
    await openLockedSheet(page);
    await page.locator('.encounter-sheet-support').click();
    await expect(page.locator('.encounter-paypal[data-rendered="yes"]')).toHaveCount(1);
    await expect(page.locator('.encounter-sheet-keep')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.encounter-sheet')).toHaveCount(0);
  });
});

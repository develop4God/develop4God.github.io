// The Apóyanos page with the PayPal SDK stubbed, so the spec runs offline and never reaches paypal.com.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const fs = require('node:fs');
const path = require('node:path');

// The active environment's ids, read from the generated config the page itself loads.
const configSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'paypal-config.js'), 'utf8');
const config = JSON.parse(configSource.slice(configSource.indexOf('Object.freeze(') + 'Object.freeze('.length, configSource.lastIndexOf(')')));
const PLANS = config.plans;
const CLIENT_ID = config.clientId;

const SDK_PATTERN = /^https:\/\/www\.paypal\.com\/sdk\/js/;

// A stand-in for the SDK that installs itself under the namespace the page asks for, and records what the
// buttons were built with (one-time order buttons or subscription buttons).
const FAKE_SDK = `
(function () {
  var ns = document.currentScript.getAttribute('data-namespace');
  window.__renders = window.__renders || [];
  window[ns] = {
    Buttons: function (options) {
      window.__lastOrderOptions = options.createOrder ? options : window.__lastOrderOptions;
      window.__lastSubscriptionOptions = options.createSubscription ? options : window.__lastSubscriptionOptions;
      return {
        render: function () {
          window.__renders.push({ ns: ns, kind: options.createSubscription ? 'subscription' : 'order' });
          return Promise.resolve();
        }
      };
    }
  };
})();`;

function stubSdk(page) {
  const requests = [];
  page.route(SDK_PATTERN, (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SDK });
  });
  return requests;
}

async function openDonate(page) {
  await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
  await page.locator('#dar').scrollIntoViewIfNeeded();
}

// The body the latest subscribe button would send to PayPal when the donor approves.
function subscriptionRequest(page) {
  return page.evaluate(() => window.__lastSubscriptionOptions.createSubscription(null, { subscription: { create: (body) => body } }));
}

const renders = (page, kind) => page.evaluate((k) => (window.__renders || []).filter((r) => r.kind === k).length, kind);

// The amount the latest one-time buttons would create an order for.
function orderAmount(page) {
  return page.evaluate(() =>
    window.__lastOrderOptions.createOrder({}, { order: { create: (order) => Promise.resolve(order) } })
      .then((order) => order.purchase_units[0].amount.value));
}

test.describe('Apóyanos page', () => {
  test('one-time is the default and renders the PayPal order buttons with the capture intent', async ({ page }) => {
    const requests = stubSdk(page);
    await openDonate(page);
    await expect.poll(() => renders(page, 'order')).toBe(1);
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get('intent')).toBe('capture');
    expect(await orderAmount(page)).toBe('10.00');
    await expect(page.locator('#once-link')).toBeHidden();
  });

  test('nothing from PayPal loads while the donate section is far from view', async ({ page }) => {
    const requests = stubSdk(page);
    await page.setViewportSize({ width: 360, height: 400 });
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    // Guard: the section must really be beyond the 400px look-ahead margin for this check to mean anything.
    const top = await page.locator('#dar').evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThan(400 + 400);
    await page.waitForTimeout(500);
    expect(requests).toHaveLength(0);
  });

  test('choosing a preset amount re-renders the one-time buttons with that amount', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await expect.poll(() => renders(page, 'order')).toBe(1);
    await page.getByRole('button', { name: '$25' }).click();
    await expect.poll(() => renders(page, 'order')).toBe(2);
    expect(await orderAmount(page)).toBe('25.00');
  });

  test('"Otro" shows a custom amount field that drives the one-time order', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Otro' }).click();
    await expect(page.locator('#other-box')).toBeVisible();
    await page.fill('#other-amount', '42.5');
    await expect.poll(() => orderAmount(page)).toBe('42.50');
  });

  test('an invalid custom amount shows a hint and creates no buttons', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Otro' }).click();
    // "Otro" starts at the valid default of 15, which renders once more.
    await expect.poll(() => renders(page, 'order')).toBe(2);
    await page.fill('#other-amount', '0.5');
    await expect(page.locator('#sdk-status')).toContainText('$1 o más');
    await page.fill('#other-amount', '10.123');
    await expect(page.locator('#sdk-status')).toContainText('$1 o más');
    await page.waitForTimeout(600);
    expect(await renders(page, 'order')).toBe(2);
  });

  test('when PayPal cannot load, the PayPal.me link appears with the selected amount', async ({ page }) => {
    await page.route(SDK_PATTERN, (route) => route.abort());
    await openDonate(page);
    await page.getByRole('button', { name: '$25' }).click();
    await expect(page.locator('#once-link')).toBeVisible();
    await expect(page.locator('#once-link')).toHaveAttribute('href', /paypalme\/develop4godOfficial\/25USD$/);
    await expect(page.locator('#sdk-status')).toContainText('No se pudo cargar PayPal');
  });

  test('monthly sends the monthly plan with the chosen amount as the quantity', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await page.getByRole('button', { name: '$25' }).click();
    await expect.poll(() => renders(page, 'subscription')).toBeGreaterThan(0);
    expect(await subscriptionRequest(page)).toEqual({ plan_id: PLANS.monthly, quantity: '25' });
    await expect(page.locator('#once-pay')).toBeHidden();
  });

  test('yearly sends the yearly plan', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Anual' }).click();
    await page.getByRole('button', { name: '$5' }).click();
    await expect.poll(async () => (await subscriptionRequest(page)).plan_id).toBe(PLANS.yearly);
    expect((await subscriptionRequest(page)).quantity).toBe('5');
  });

  test('"Otro" with a recurring frequency sends the typed whole amount as the quantity', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await page.getByRole('button', { name: 'Otro' }).click();
    await expect(page.locator('#other-box')).toBeVisible();
    await page.fill('#other-amount', '137');
    await expect.poll(async () => (await subscriptionRequest(page)).quantity).toBe('137');
  });

  test('a recurring custom amount below the minimum, with decimals or junk creates no button', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await page.getByRole('button', { name: 'Otro' }).click();
    for (const bad of ['4', '12.5', '0', '-8', '']) {
      await page.fill('#other-amount', bad);
      await expect(page.locator('#sdk-status')).toContainText('monto entero entre $5 y $10000');
      await expect(page.locator('#plans > *')).toHaveCount(0);
    }
  });

  test('a recurring amount above the maximum creates no button', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await page.getByRole('button', { name: 'Otro' }).click();
    await page.fill('#other-amount', '99999999');
    await expect(page.locator('#sdk-status')).toContainText('monto entero entre $5 y $10000');
    await expect(page.locator('#plans > *')).toHaveCount(0);
  });

  test('an invalid recurring amount is explained even after an earlier failure message', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await expect.poll(() => renders(page, 'order')).toBe(1);
    await page.evaluate(() => window.__lastOrderOptions.onError(new Error('declined')));
    await expect(page.locator('#sdk-status')).toContainText('no se completó');
    await page.getByRole('button', { name: 'Mensual' }).click();
    await page.getByRole('button', { name: 'Otro' }).click();
    await page.fill('#other-amount', '3');
    await expect(page.locator('#sdk-status')).toContainText('monto entero entre $5 y $10000');
  });

  test('the subscription SDK loads on demand and the button is rebuilt for each amount', async ({ page }) => {
    const requests = stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await expect.poll(() => renders(page, 'subscription')).toBe(1);
    const subscription = requests.find((url) => url.searchParams.get('intent') === 'subscription');
    expect(subscription.searchParams.get('vault')).toBe('true');
    expect(subscription.searchParams.get('client-id')).toBe(CLIENT_ID);
    await page.getByRole('button', { name: '$25' }).click();
    await expect.poll(() => renders(page, 'subscription')).toBe(2);
    expect((await subscriptionRequest(page)).quantity).toBe('25');
  });

  test('the preset buttons are the ones in the PayPal config, and the page shows nothing else', async ({ page }) => {
    stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    const presets = await page.locator('[data-amount]:not([data-amount="other"])').evaluateAll((els) => els.map((el) => Number(el.dataset.amount)));
    expect(presets).toEqual(await page.evaluate(() => window.PayPalConfig.presetAmounts));
  });

  const approveOnce = (page, status) => page.evaluate((st) => window.__lastOrderOptions.onApprove({}, {
    order: { capture: () => Promise.resolve({ status: st, id: 'ORDER-123' }) },
  }), status);

  test('a completed one-time gift replaces the controls with a clear confirmation', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await expect.poll(() => renders(page, 'order')).toBe(1);
    await approveOnce(page, 'COMPLETED');
    const thanks = page.locator('#thanks');
    await expect(thanks).toBeVisible();
    await expect(page.locator('#thanks-title')).toContainText('¡Gracias por apoyar nuestro ministerio!');
    await expect(page.locator('#thanks-detail')).toContainText('$10');
    await expect(page.locator('#thanks-detail')).toContainText('correo');
    await expect(page.locator('#thanks-ref')).toContainText('ORDER-123');
    await expect(page.locator('#give-controls')).toBeHidden();
    await expect(thanks).toBeFocused();
  });

  test('the confirmation blesses the donor with a verse from the Bible', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await expect.poll(() => renders(page, 'order')).toBe(1);
    await approveOnce(page, 'COMPLETED');
    await expect(page.locator('#thanks-blessing')).toContainText('Bendiciones');
    await expect(page.locator('#thanks-verse')).toContainText('El que siembra generosamente, generosamente también segará.');
    await expect(page.locator('#thanks-verse-ref')).toHaveText('2 Corintios 9:6');
  });

  test('a confirmation celebrates with confetti', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await expect.poll(() => renders(page, 'order')).toBe(1);
    await approveOnce(page, 'COMPLETED');
    await expect(page.locator('.celebration')).toHaveCount(1);
    expect(await page.locator('.celebration .confetti-piece').count()).toBeGreaterThan(10);
    await expect(page.locator('.celebration')).toHaveCount(0, { timeout: 5000 }); // removed after the animation
  });

  test('no confetti when the visitor prefers reduced motion, but the confirmation still shows', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    stubSdk(page);
    await openDonate(page);
    await expect.poll(() => renders(page, 'order')).toBe(1);
    await approveOnce(page, 'COMPLETED');
    await expect(page.locator('#thanks')).toBeVisible();
    await expect(page.locator('.celebration')).toHaveCount(0);
  });

  test('a subscription also celebrates', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await expect.poll(() => renders(page, 'subscription')).toBeGreaterThan(0);
    await page.evaluate(() => window.__lastSubscriptionOptions.onApprove({ subscriptionID: 'I-TEST3' }));
    await expect(page.locator('.celebration')).toHaveCount(1);
    await expect(page.locator('#thanks-verse-ref')).toHaveText('2 Corintios 9:6');
  });

  test('an approved monthly subscription confirms the amount, the frequency and how to cancel', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await page.getByRole('button', { name: '$25' }).click();
    await expect.poll(() => renders(page, 'subscription')).toBeGreaterThan(0);
    await page.evaluate(() => window.__lastSubscriptionOptions.onApprove({ subscriptionID: 'I-TEST1' }));
    await expect(page.locator('#thanks-detail')).toContainText('mensual de $25');
    await expect(page.locator('#thanks-detail')).toContainText('cancelarlo');
    await expect(page.locator('#thanks-ref')).toContainText('I-TEST1');
    await expect(page.locator('#give-controls')).toBeHidden();
  });

  test('a yearly subscription says yearly', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Anual' }).click();
    await expect.poll(() => renders(page, 'subscription')).toBeGreaterThan(0);
    await page.evaluate(() => window.__lastSubscriptionOptions.onApprove({ subscriptionID: 'I-TEST2' }));
    await expect(page.locator('#thanks-detail')).toContainText('anual de $10');
  });

  test('"¡Amén!" closes the confirmation and brings the controls back', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await expect.poll(() => renders(page, 'order')).toBe(1);
    await approveOnce(page, 'COMPLETED');
    await page.getByRole('button', { name: /Amén/ }).click();
    await expect(page.locator('#thanks')).toBeHidden();
    await expect(page.locator('#give-controls')).toBeVisible();
    await expect.poll(() => renders(page, 'order')).toBe(2);
  });

  test('a pending payment is not celebrated: no confirmation card, a warning in the status line', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await expect.poll(() => renders(page, 'order')).toBe(1);
    await approveOnce(page, 'PENDING');
    await expect(page.locator('#thanks')).toBeHidden();
    await expect(page.locator('#give-controls')).toBeVisible();
    await expect(page.locator('#sdk-status')).toContainText('pendiente');
  });

  test('a failed subscription keeps the controls and shows the failure', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await expect.poll(() => renders(page, 'subscription')).toBeGreaterThan(0);
    await page.evaluate(() => window.__lastSubscriptionOptions.onError(new Error('declined')));
    await expect(page.locator('#thanks')).toBeHidden();
    await expect(page.locator('#sdk-status')).toContainText('no se completó');
  });

  test('the Encounters unlock option links to the Encounters page', async ({ page }) => {
    stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'Desbloquear Encuentros' })).toHaveAttribute('href', '/devocionales/encounters/');
  });
});

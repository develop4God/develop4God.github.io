// The Apóyanos page with the PayPal SDK stubbed, so the spec runs offline and never reaches paypal.com.
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

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

  test('choosing monthly shows only the subscribe button for the selected amount', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await page.getByRole('button', { name: '$25' }).click();
    const visible = page.locator('.plan-slot.visible');
    await expect(visible).toHaveCount(1);
    await expect(visible).toHaveAttribute('data-plan', 'P-35R67290FY745831SNMALS2Q');
    await expect(page.locator('#once-pay')).toBeHidden();
  });

  test('yearly shows the yearly plan for the selected amount', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Anual' }).click();
    await page.getByRole('button', { name: '$5' }).click();
    await expect(page.locator('.plan-slot.visible')).toHaveAttribute('data-plan', 'P-0LF0259858521293SNMALTTQ');
  });

  test('the subscription SDK loads on demand and renders only the visible plan', async ({ page }) => {
    const requests = stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await expect.poll(() => renders(page, 'subscription')).toBe(1);
    const subscription = requests.find((url) => url.searchParams.get('intent') === 'subscription');
    expect(subscription.searchParams.get('vault')).toBe('true');
    await page.getByRole('button', { name: '$25' }).click();
    await expect.poll(() => renders(page, 'subscription')).toBe(2);
    await page.getByRole('button', { name: '$10' }).click();
    await page.waitForTimeout(300);
    expect(await renders(page, 'subscription')).toBe(2); // the $10 button was rendered at the start; not again
  });

  test('a thank-you message survives later amount changes', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await expect.poll(() => renders(page, 'order')).toBe(1);
    await page.evaluate(() => window.__lastOrderOptions.onApprove({}, {
      order: { capture: () => Promise.resolve({ status: 'COMPLETED' }) },
    }));
    await expect(page.locator('#sdk-status')).toContainText('Gracias');
    await page.getByRole('button', { name: '$25' }).click();
    await expect(page.locator('#sdk-status')).toContainText('Gracias');
  });

  test('the Encounters unlock option links to the Encounters page', async ({ page }) => {
    stubSdk(page);
    await page.goto('/apoyanos/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: 'Desbloquear Encuentros' })).toHaveAttribute('href', '/devocionales/encounters/');
  });

  test('"Otro" with a recurring frequency explains that recurring amounts are fixed', async ({ page }) => {
    stubSdk(page);
    await openDonate(page);
    await page.getByRole('button', { name: 'Mensual' }).click();
    await page.getByRole('button', { name: 'Otro' }).click();
    await expect(page.locator('#sdk-status')).toContainText('montos fijos');
  });
});

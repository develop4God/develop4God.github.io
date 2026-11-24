(function (global) {
    'use strict';

    // Reusable PayPal checkout with no server: the PayPal JS SDK creates and captures the order in
    // the browser, and the merchant account receives the money. Later features (Encounters unlock,
    // recurring support) reuse these builders and the renderer, and add their own callbacks.
    // Pure builders have no DOM, so they are unit-tested in node; renderButtons takes the SDK object
    // as a parameter so it can be tested with a fake.

    const SDK_URL = 'https://www.paypal.com/sdk/js';
    const CURRENCY = /^[A-Z]{3}$/;
    const MAX_DESCRIPTION = 127;

    // One SDK load per page and one intent: 'capture' for one-time orders, 'subscription' for plans.
    const INTENTS = ['capture', 'subscription'];

    // Subscription plans created in the sandbox dashboard (fixed amounts). Single source for every page.
    const SUBSCRIPTION_PLANS = Object.freeze([
        Object.freeze({ frequency: 'monthly', amount: 5, label: 'Monthly 5 USD', planId: 'P-8PA466822A405015PNMALDPA' }),
        Object.freeze({ frequency: 'monthly', amount: 10, label: 'Monthly 10 USD', planId: 'P-1X969655D5226362GNMALSLQ' }),
        Object.freeze({ frequency: 'monthly', amount: 25, label: 'Monthly 25 USD', planId: 'P-35R67290FY745831SNMALS2Q' }),
        Object.freeze({ frequency: 'yearly', amount: 5, label: 'Yearly 5 USD', planId: 'P-0LF0259858521293SNMALTTQ' }),
        Object.freeze({ frequency: 'yearly', amount: 10, label: 'Yearly 10 USD', planId: 'P-3JT2138474919812VNMALUCA' }),
        Object.freeze({ frequency: 'yearly', amount: 25, label: 'Yearly 25 USD', planId: 'P-4S8263013S486825RNMALUPY' }),
    ]);

    function buildSdkUrl({ clientId, currency, intent = 'capture' } = {}) {
        if (typeof clientId !== 'string' || clientId.trim() === '') {
            throw new Error('PayPalCheckout: clientId is required');
        }
        if (typeof currency !== 'string' || !CURRENCY.test(currency)) {
            throw new Error('PayPalCheckout: currency must be a three-letter uppercase code');
        }
        if (!INTENTS.includes(intent)) {
            throw new Error('PayPalCheckout: intent must be capture or subscription');
        }
        const params = new URLSearchParams({
            'client-id': clientId,
            currency,
            intent,
            components: 'buttons',
        });
        if (intent === 'subscription') {
            params.set('vault', 'true');
        }
        return `${SDK_URL}?${params.toString()}`;
    }

    function formatAmount(amount) {
        // Compare in cents with a tolerance: 0.07 * 100 is 7.000000000000001 in floating point.
        const valid = typeof amount === 'number' && Number.isFinite(amount) && amount > 0
            && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
        if (!valid) {
            throw new Error('PayPalCheckout: amount must be a positive number with at most two decimals');
        }
        return amount.toFixed(2);
    }

    function buildOrder({ amount, currency, description } = {}) {
        const value = formatAmount(amount);
        if (typeof currency !== 'string' || !CURRENCY.test(currency)) {
            throw new Error('PayPalCheckout: currency must be a three-letter uppercase code');
        }
        const unit = { amount: { currency_code: currency, value } };
        if (description !== undefined) {
            if (typeof description !== 'string' || description.length > MAX_DESCRIPTION) {
                throw new Error(`PayPalCheckout: description must be a string of at most ${MAX_DESCRIPTION} characters`);
            }
            unit.description = description;
        }
        return { purchase_units: [unit] };
    }

    // paypal is the SDK global (window.paypal) once the script has loaded.
    function renderButtons(paypal, container, { amount, currency, description, onApproved, onError } = {}) {
        const order = buildOrder({ amount, currency, description });
        return paypal.Buttons({
            createOrder: (data, actions) => actions.order.create(order),
            // Two-argument then: an error thrown by onApproved must not be reported as a failed
            // capture, because the money has already moved and the user could pay again.
            onApprove: (data, actions) => actions.order.capture().then(
                (details) => {
                    try {
                        if (typeof onApproved === 'function') onApproved(details);
                    } catch (error) {
                        console.error('PayPalCheckout: onApproved failed after a successful capture', error);
                    }
                },
                (error) => {
                    if (typeof onError === 'function') onError(error);
                },
            ),
            onError: (error) => {
                if (typeof onError === 'function') onError(error);
            },
        }).render(container);
    }

    // Subscribe button for a plan created in the PayPal dashboard. The amount comes from the plan.
    function renderSubscriptionButton(paypal, container, { planId, onApproved, onError } = {}) {
        if (typeof planId !== 'string' || planId.trim() === '') {
            throw new Error('PayPalCheckout: planId is required');
        }
        return paypal.Buttons({
            style: { shape: 'pill', color: 'blue', layout: 'vertical', label: 'subscribe' },
            createSubscription: (data, actions) => actions.subscription.create({ plan_id: planId }),
            // An error thrown by onApproved must not be reported as a failed subscription: it is already approved.
            onApprove: (data) => {
                try {
                    if (typeof onApproved === 'function') onApproved(data.subscriptionID);
                } catch (error) {
                    console.error('PayPalCheckout: onApproved failed after an approved subscription', error);
                }
            },
            onError: (error) => {
                if (typeof onError === 'function') onError(error);
            },
        }).render(container);
    }

    global.PayPalCheckout = { buildSdkUrl, buildOrder, renderButtons, renderSubscriptionButton, SUBSCRIPTION_PLANS };
})(window);

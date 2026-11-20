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

    function buildSdkUrl({ clientId, currency } = {}) {
        if (typeof clientId !== 'string' || clientId.trim() === '') {
            throw new Error('PayPalCheckout: clientId is required');
        }
        if (typeof currency !== 'string' || !CURRENCY.test(currency)) {
            throw new Error('PayPalCheckout: currency must be a three-letter uppercase code');
        }
        const params = new URLSearchParams({
            'client-id': clientId,
            currency,
            intent: 'capture',
            components: 'buttons',
        });
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

    global.PayPalCheckout = { buildSdkUrl, buildOrder, renderButtons };
})(window);

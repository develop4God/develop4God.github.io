(function (global, navigator) {
    'use strict';

    // Reports a donation-page error to /api/client-error so the site owner can see what donors hit.
    // Fire and forget: reporting must never break the page or the payment flow, so every failure is
    // swallowed. Each stage and message is sent once per page load so a retry loop cannot flood the log.
    const ENDPOINT = '/api/client-error';
    const sent = new Set();
    // The endpoint caps messages at the same length; cutting here keeps a long PayPal error from
    // pushing the whole report over the endpoint's body limit.
    const MAX_MESSAGE = 300;

    function messageOf(error) {
        let text = 'unknown';
        if (typeof error === 'string') text = error;
        else if (error && typeof error.message === 'string') text = error.message;
        return text.slice(0, MAX_MESSAGE);
    }

    function buildPayload(stage, error, { frequency, quantity } = {}) {
        const payload = { stage, message: messageOf(error) };
        if (frequency !== undefined) payload.frequency = frequency;
        if (quantity !== undefined) payload.quantity = quantity;
        return payload;
    }

    function transmit(body) {
        try {
            const blob = new Blob([body], { type: 'application/json' });
            if (navigator && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, blob)) return;
        } catch (error) {
            // fall through to fetch
        }
        if (typeof global.fetch !== 'function') return;
        const request = global.fetch(ENDPOINT, { method: 'POST', body, keepalive: true });
        if (request && typeof request.catch === 'function') request.catch(() => {});
    }

    function report(stage, error, context) {
        try {
            const payload = buildPayload(stage, error, context);
            const key = [stage, payload.frequency, payload.message].join('|');
            if (sent.has(key)) return;
            sent.add(key);
            transmit(JSON.stringify(payload));
        } catch (failure) {
            // reporting must never throw into the page
        }
    }

    global.ErrorReport = { report, buildPayload };
})(window, typeof navigator === 'undefined' ? undefined : navigator);

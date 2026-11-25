// Donation controls of the Apóyanos page: frequency (once / monthly / yearly), amount and the PayPal
// buttons. One-time gifts render the standard PayPal buttons (yellow PayPal button plus the card
// option); recurring gifts render the subscription button of the monthly or yearly quantity plan, with the
// donor's amount as the quantity. The two flows need different SDK intents, so each loads on demand into
// its own namespace. Needs the PayPalCheckout, PayPalConfig and DevotionalPwaConfig globals loaded before it.
(function () {
    'use strict';

    // js/paypal-config.js, generated from config/paypal.<environment>.yml. Without it only the recurring options degrade.
    var recurring = window.PayPalConfig || null;
    var PAYPAL_ME = 'https://www.paypal.com/paypalme/develop4godOfficial/';
    var DESCRIPTION = 'Apoyo a Devocionales Cristianos';
    var AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
    var MIN_ONCE_AMOUNT = 1;
    var DEBOUNCE_MS = 400;

    var MSG = {
        thanksTitle: '🎉 ¡Gracias por apoyar nuestro ministerio!',
        receipt: 'PayPal te enviará el recibo por correo.',
        pending: 'Tu pago quedó pendiente. Revisa tu cuenta de PayPal antes de intentarlo de nuevo.',
        failed: 'El aporte no se completó. Intenta de nuevo.',
        sdkFailed: 'No se pudo cargar PayPal. Puedes dar con el enlace de PayPal de abajo.',
        sdkFailedRecurring: 'No se pudo cargar PayPal. Revisa tu conexión e intenta de nuevo.',
        recurringUnavailable: 'Los aportes mensuales y anuales no están disponibles ahora. Puedes dar una sola vez.',
        badAmount: 'Escribe un monto de $1 o más, con hasta dos decimales.',
    };

    var onceConfig = window.DevotionalPwaConfig && window.DevotionalPwaConfig.encountersUnlock;
    var state = { frequency: 'once', amount: 10 };
    var sdkLoads = {};
    var renderToken = 0;

    var frequencyButtons = document.querySelectorAll('[data-frequency]');
    var amountButtons = document.querySelectorAll('[data-amount]');
    var otherBox = document.getElementById('other-box');
    var otherInput = document.getElementById('other-amount');
    var oncePay = document.getElementById('once-pay');
    var onceButtons = document.getElementById('once-buttons');
    var onceLink = document.getElementById('once-link');
    var plansBox = document.getElementById('plans');
    var controls = document.getElementById('give-controls');
    var thanks = document.getElementById('thanks');
    var FREQUENCY_WORD = { monthly: 'mensual', yearly: 'anual' };
    // Confetti for a completed gift. Decorative, so the page works without it (script blocked or reduced motion).
    var celebration = window.UiCelebration && window.DomBuilder ? window.UiCelebration.createCelebration({
        h: window.DomBuilder.createBuilder(document),
        container: document.body,
        reducedMotion: function () { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
    }) : null;
    var status = document.getElementById('sdk-status');

    // The status line: a validation hint or a failure. Every new choice clears it before rendering again.
    function say(text) { status.textContent = text; }

    // The confirmation replaces the payment controls, so the donor sees that it worked and cannot pay twice by accident.
    function showThanks(detail, reference) {
        if (!thanks) { say(detail); return; } // an older cached page has no confirmation card
        say('');
        document.getElementById('thanks-title').textContent = MSG.thanksTitle;
        document.getElementById('thanks-detail').textContent = detail;
        document.getElementById('thanks-ref').textContent = reference ? 'Referencia: ' + reference : '';
        controls.hidden = true;
        thanks.hidden = false;
        thanks.focus();
        thanks.scrollIntoView({ block: 'nearest' });
        if (celebration) { celebration.burst(); }
    }

    // Loads one SDK build into window[namespace]; a failed load can be retried.
    function loadSdk(namespace, url) {
        if (!sdkLoads[namespace]) {
            sdkLoads[namespace] = new Promise(function (resolve, reject) {
                var script = document.createElement('script');
                script.src = url;
                script.setAttribute('data-namespace', namespace);
                script.onload = function () { resolve(window[namespace]); };
                script.onerror = function () { delete sdkLoads[namespace]; reject(new Error('sdk')); };
                document.head.appendChild(script);
            });
        }
        return sdkLoads[namespace];
    }

    function onceSdk() {
        var url = PayPalCheckout.buildSdkUrl({ clientId: onceConfig.clientId, currency: onceConfig.currency });
        return loadSdk('paypalOnce', url);
    }

    function subscriptionSdk() {
        var url = PayPalCheckout.buildSdkUrl({ clientId: recurring.clientId, currency: recurring.currency, intent: 'subscription' });
        return loadSdk('paypalSub', url);
    }

    function amountText() {
        return state.amount === 'other' ? otherInput.value.trim() : String(state.amount);
    }

    function validOnceAmount(raw) {
        return AMOUNT_PATTERN.test(raw) && parseFloat(raw) >= MIN_ONCE_AMOUNT;
    }

    // The PayPal.me link is the fallback when the SDK cannot load (offline, blocked).
    function setFallbackLink(raw) {
        onceLink.href = PAYPAL_ME + (validOnceAmount(raw) ? raw : MIN_ONCE_AMOUNT) + 'USD';
    }

    function showFallback() {
        onceLink.hidden = false;
        say(MSG.sdkFailed);
    }

    function renderOnce() {
        var raw = amountText();
        var token = ++renderToken;
        say('');
        onceButtons.replaceChildren();
        onceLink.hidden = true;
        setFallbackLink(raw);
        if (!validOnceAmount(raw)) { say(MSG.badAmount); return; }
        if (!onceConfig || !onceConfig.clientId) { showFallback(); return; }
        var slot = document.createElement('div');
        onceButtons.appendChild(slot);
        onceSdk().then(function (paypal) {
            if (token !== renderToken) { return null; } // a newer amount replaced this render
            return PayPalCheckout.renderButtons(paypal, slot, {
                style: Object.assign({}, PayPalCheckout.PILL_LOOK, { color: 'gold' }),
                amount: parseFloat(raw),
                currency: onceConfig.currency,
                description: DESCRIPTION,
                onApproved: function (details) {
                    if (details && details.status === 'COMPLETED') {
                        showThanks('Recibimos tu aporte único de $' + raw + ' USD. ' + MSG.receipt, details.id);
                    } else {
                        say(MSG.pending);
                    }
                },
                onError: function () { say(MSG.failed); },
            });
        }).catch(function (error) {
            if (token !== renderToken) { return; }
            if (error && error.message === 'sdk') { showFallback(); return; }
            console.error('Apoyanos: the one-time buttons failed to render', error);
            onceLink.hidden = false;
            say(MSG.failed);
        });
    }

    // The recurring button is rebuilt whenever the frequency or the amount changes: the quantity is part of
    // the subscription request, so one plan per frequency serves every amount.
    function renderRecurring() {
        var token = ++renderToken;
        say('');
        plansBox.replaceChildren();
        if (!recurring || !PayPalCheckout.parseQuantity) { say(MSG.recurringUnavailable); return; }
        var quantity = PayPalCheckout.parseQuantity(amountText(), recurring.minimumAmount, recurring.maximumAmount);
        if (quantity === null) {
            say('Escribe un monto entero entre $' + recurring.minimumAmount + ' y $' + recurring.maximumAmount + ', sin decimales.');
            return;
        }
        var frequency = state.frequency; // the donor may change it before PayPal answers
        var slot = document.createElement('div');
        plansBox.appendChild(slot);
        subscriptionSdk().then(function (paypal) {
            if (token !== renderToken) { return null; } // a newer choice replaced this render
            return PayPalCheckout.renderSubscriptionButton(paypal, slot, {
                planId: recurring.plans[frequency],
                quantity: quantity,
                onApproved: function (subscriptionId) {
                    showThanks('Tu aporte ' + FREQUENCY_WORD[frequency] + ' de $' + (quantity * recurring.unitPrice) + ' ' + recurring.currency + ' quedó activo. ' + MSG.receipt
                        + ' Puedes cancelarlo cuando quieras desde tu cuenta de PayPal.', subscriptionId);
                },
                onError: function () { say(MSG.failed); },
            });
        }).catch(function (error) {
            if (token !== renderToken) { return; }
            if (error && error.message === 'sdk') { say(MSG.sdkFailedRecurring); return; }
            console.error('Apoyanos: the subscribe button failed to render', error);
            say(MSG.failed);
        });
    }

    function refresh() {
        var once = state.frequency === 'once';
        otherBox.hidden = state.amount !== 'other';
        oncePay.hidden = !once;
        plansBox.hidden = once;
        // Recurring gifts are whole dollars from the plan minimum up; one-time gifts allow cents.
        otherInput.min = once || !recurring ? String(MIN_ONCE_AMOUNT) : String(recurring.minimumAmount);
        otherInput.step = once ? '0.01' : '1';
        if (once) { renderOnce(); } else { renderRecurring(); }
    }

    function pressed(buttons, key, value) {
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(key) === value)); });
    }

    function debounce(fn, ms) {
        var timer = null;
        return function () { clearTimeout(timer); timer = setTimeout(fn, ms); };
    }

    var thanksAgain = document.getElementById('thanks-again');
    if (thanksAgain) {
        thanksAgain.addEventListener('click', function () {
            thanks.hidden = true;
            controls.hidden = false;
            say('');
            refresh();
        });
    }

    frequencyButtons.forEach(function (b) {
        b.addEventListener('click', function () {
            state.frequency = b.getAttribute('data-frequency');
            pressed(frequencyButtons, 'data-frequency', state.frequency);
            refresh();
        });
    });
    amountButtons.forEach(function (b) {
        b.addEventListener('click', function () {
            var raw = b.getAttribute('data-amount');
            state.amount = raw === 'other' ? 'other' : Number(raw);
            pressed(amountButtons, 'data-amount', raw);
            refresh();
        });
    });
    otherInput.addEventListener('input', debounce(function () {
        if (state.amount !== 'other') { return; }
        if (state.frequency === 'once') { renderOnce(); } else { renderRecurring(); }
    }, DEBOUNCE_MS));

    setFallbackLink(amountText());
    oncePay.hidden = false;

    // The one-time buttons are the default view: load them when the donate section is about to show,
    // not on page load, so the page stays light for visitors who never reach it.
    var donate = document.getElementById('dar');
    if (onceConfig && onceConfig.clientId && 'IntersectionObserver' in window) {
        var near = new IntersectionObserver(function (entries) {
            if (!entries[0].isIntersecting) { return; }
            near.disconnect();
            refresh();
        }, { rootMargin: '400px' });
        near.observe(donate);
    } else if (onceConfig && onceConfig.clientId) {
        refresh();
    } else {
        showFallback();
    }
})();

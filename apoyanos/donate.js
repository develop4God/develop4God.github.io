// Donation controls of the Apóyanos page: frequency (once / monthly / yearly), amount and the PayPal
// buttons. One-time gifts render the standard PayPal buttons (yellow PayPal button plus the card
// option); recurring gifts render the subscription button of the matching plan. The two flows need
// different SDK intents, so each loads on demand into its own namespace.
// Needs the PayPalCheckout and DevotionalPwaConfig globals loaded before it.
(function () {
    'use strict';

    // PUBLIC client id of the sandbox app that owns the subscription plans in PayPalCheckout.SUBSCRIPTION_PLANS.
    var SUBSCRIPTION_CLIENT_ID = 'AQ71LLZhIEEHJcztnFQ-1X-VT0v3FEVWOCJFPm6lu3gQANytMKRXGCFGg3Ic5xMX7pERPz0JiHCHd0a-';
    var PAYPAL_ME = 'https://www.paypal.com/paypalme/develop4godOfficial/';
    var DESCRIPTION = 'Apoyo a Devocionales Cristianos';
    var AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
    var MIN_ONCE_AMOUNT = 1;
    var DEBOUNCE_MS = 400;

    var MSG = {
        thanks: '¡Gracias! Tu aporte se recibió.',
        pending: 'Tu pago quedó pendiente. Revisa tu cuenta de PayPal antes de intentarlo de nuevo.',
        failed: 'El aporte no se completó. Intenta de nuevo.',
        thanksRecurring: '¡Gracias! Tu aporte mensual o anual quedó registrado.',
        sdkFailed: 'No se pudo cargar PayPal. Puedes dar con el enlace de PayPal de abajo.',
        badAmount: 'Escribe un monto de $1 o más, con hasta dos decimales.',
        fixedAmounts: 'Los aportes mensuales y anuales están en montos fijos ($5, $10 o $25).',
    };

    var onceConfig = window.DevotionalPwaConfig && window.DevotionalPwaConfig.encountersUnlock;
    var state = { frequency: 'once', amount: 10 };
    var sdkLoads = {};
    var renderToken = 0;
    var subscriptionsRendered = false;

    var frequencyButtons = document.querySelectorAll('[data-frequency]:not(.plan-slot)');
    var amountButtons = document.querySelectorAll('[data-amount]:not(.plan-slot)');
    var otherBox = document.getElementById('other-box');
    var otherInput = document.getElementById('other-amount');
    var oncePay = document.getElementById('once-pay');
    var onceButtons = document.getElementById('once-buttons');
    var onceLink = document.getElementById('once-link');
    var plansBox = document.getElementById('plans');
    var status = document.getElementById('sdk-status');

    function say(text) { status.textContent = text; }

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
        var url = PayPalCheckout.buildSdkUrl({ clientId: SUBSCRIPTION_CLIENT_ID, currency: 'USD', intent: 'subscription' });
        return loadSdk('paypalSub', url);
    }

    function onceAmount() {
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
        var raw = onceAmount();
        var token = ++renderToken;
        onceButtons.replaceChildren();
        onceLink.hidden = true;
        setFallbackLink(raw);
        if (!validOnceAmount(raw)) { say(MSG.badAmount); return; }
        say('');
        var slot = document.createElement('div');
        onceButtons.appendChild(slot);
        onceSdk().then(function (paypal) {
            if (token !== renderToken) { return null; } // a newer amount replaced this render
            return PayPalCheckout.renderButtons(paypal, slot, {
                amount: parseFloat(raw),
                currency: onceConfig.currency,
                description: DESCRIPTION,
                onApproved: function (details) { say(details && details.status === 'COMPLETED' ? MSG.thanks : MSG.pending); },
                onError: function () { say(MSG.failed); },
            });
        }).catch(function () {
            if (token === renderToken) { showFallback(); }
        });
    }

    function buildPlanSlots() {
        PayPalCheckout.SUBSCRIPTION_PLANS.forEach(function (plan) {
            var slot = document.createElement('div');
            slot.className = 'plan-slot';
            slot.setAttribute('data-frequency', plan.frequency);
            slot.setAttribute('data-amount', String(plan.amount));
            slot.setAttribute('data-plan', plan.planId);
            plansBox.appendChild(slot);
        });
    }

    function renderSubscriptions() {
        if (subscriptionsRendered) { return; }
        subscriptionsRendered = true;
        subscriptionSdk().then(function (paypal) {
            plansBox.querySelectorAll('.plan-slot').forEach(function (slot) {
                PayPalCheckout.renderSubscriptionButton(paypal, slot, {
                    planId: slot.getAttribute('data-plan'),
                    onApproved: function () { say(MSG.thanksRecurring); },
                    onError: function () { say(MSG.failed); },
                });
            });
        }).catch(function () {
            subscriptionsRendered = false;
            say(MSG.sdkFailed.replace(' Puedes dar con el enlace de PayPal de abajo.', ''));
        });
    }

    function refreshRecurring() {
        plansBox.querySelectorAll('.plan-slot').forEach(function (slot) {
            var show = slot.getAttribute('data-frequency') === state.frequency
                && slot.getAttribute('data-amount') === String(state.amount);
            slot.classList.toggle('visible', show);
        });
        say(state.amount === 'other' ? MSG.fixedAmounts : '');
        renderSubscriptions();
    }

    function refresh() {
        var once = state.frequency === 'once';
        otherBox.hidden = !(once && state.amount === 'other');
        oncePay.hidden = !once;
        plansBox.hidden = once;
        if (once) { renderOnce(); } else { refreshRecurring(); }
    }

    function pressed(buttons, key, value) {
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(key) === value)); });
    }

    function debounce(fn, ms) {
        var timer = null;
        return function () { clearTimeout(timer); timer = setTimeout(fn, ms); };
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
        if (state.frequency === 'once' && state.amount === 'other') { renderOnce(); }
    }, DEBOUNCE_MS));

    buildPlanSlots();
    setFallbackLink(onceAmount());
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

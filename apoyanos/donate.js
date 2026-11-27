// Donation controls of the Apóyanos page: frequency (once / monthly / yearly), amount and the PayPal
// buttons. One-time gifts render the standard PayPal buttons (yellow PayPal button plus the card
// option); recurring gifts render the subscription button of the monthly or yearly quantity plan, with the
// donor's amount as the quantity. The two flows need different SDK intents, so each loads on demand into
// its own namespace. Needs the PayPalCheckout, PayPalConfig and DevotionalPwaConfig globals (and optionally ErrorReport) loaded before it.
(function () {
    'use strict';

    // js/paypal-config.js, generated from config/paypal.<environment>.yml. Without it only the recurring options degrade.
    var recurring = window.PayPalConfig || null;
    var PAYPAL_ME = 'https://www.paypal.com/paypalme/develop4godOfficial/';
    var DESCRIPTION = 'Apoyo a Devocionales Cristianos';
    var AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
    var MIN_ONCE_AMOUNT = 1;
    var DEBOUNCE_MS = 400;

    // Strings come from /lang/apoyanos/{lang}.json through apoyanos-i18n.js, which the page loads before this script.
    // A page cached from before that script existed lacks its tag, so load it here rather than fail.
    var i18n = window.ApoyanosI18n || null;
    function t(key, params) { return i18n ? i18n.t(key, params) : key; }
    function loadI18n() {
        return new Promise(function (resolve) {
            var script = document.createElement('script');
            script.src = '/apoyanos/js/apoyanos-i18n.js';
            script.onload = function () { i18n = window.ApoyanosI18n; resolve(i18n.ready); };
            script.onerror = function () { resolve(); };
            document.head.appendChild(script);
        });
    }
    var i18nReady = i18n ? i18n.ready : loadI18n();

    // js/error-report.js; optional so the page still works if that script is blocked.
    function report(stage, error, context) {
        if (window.ErrorReport) { window.ErrorReport.report(stage, error, context); }
    }

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
        document.getElementById('thanks-title').textContent = t('thanks.title');
        document.getElementById('thanks-detail').textContent = detail;
        document.getElementById('thanks-ref').textContent = reference ? t('thanks.reference', { id: reference }) : '';
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
        say(t('errors.sdkFailed'));
    }

    function renderOnce() {
        var raw = amountText();
        var token = ++renderToken;
        say('');
        onceButtons.replaceChildren();
        onceLink.hidden = true;
        setFallbackLink(raw);
        if (!validOnceAmount(raw)) { say(t('errors.badAmount')); return; }
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
                        showThanks(t('thanks.once', { amount: raw }), details.id);
                    } else {
                        say(t('errors.pending'));
                    }
                },
                onError: function (error) { report('checkout', error, { frequency: 'once' }); say(t('errors.failed')); },
            });
        }).catch(function (error) {
            if (token !== renderToken) { return; }
            if (error && error.message === 'sdk') { report('sdk', 'PayPal SDK did not load', { frequency: 'once' }); showFallback(); return; }
            report('render', error, { frequency: 'once' });
            console.error('Apoyanos: the one-time buttons failed to render', error);
            onceLink.hidden = false;
            say(t('errors.failed'));
        });
    }

    // The recurring button is rebuilt whenever the frequency or the amount changes: the quantity is part of
    // the subscription request, so one plan per frequency serves every amount.
    function renderRecurring() {
        var token = ++renderToken;
        say('');
        plansBox.replaceChildren();
        if (!recurring || !PayPalCheckout.parseQuantity) { say(t('errors.recurringUnavailable')); return; }
        var quantity = PayPalCheckout.parseQuantity(amountText(), recurring.minimumAmount, recurring.maximumAmount);
        if (quantity === null) {
            say(t('errors.badWholeAmount', { min: recurring.minimumAmount, max: recurring.maximumAmount }));
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
                    showThanks(t('thanks.' + frequency, { amount: quantity * recurring.unitPrice, currency: recurring.currency }), subscriptionId);
                },
                onError: function (error) { report('subscribe', error, { frequency: frequency, quantity: quantity }); say(t('errors.failed')); },
            });
        }).catch(function (error) {
            if (token !== renderToken) { return; }
            if (error && error.message === 'sdk') { report('sdk', 'PayPal SDK did not load', { frequency: frequency, quantity: quantity }); say(t('errors.sdkFailedRecurring')); return; }
            report('render', error, { frequency: frequency, quantity: quantity });
            console.error('Apoyanos: the subscribe button failed to render', error);
            say(t('errors.failed'));
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
    // It waits for the translations: the first render can already show a message.
    var donate = document.getElementById('dar');
    i18nReady.then(function () {
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
    });
})();

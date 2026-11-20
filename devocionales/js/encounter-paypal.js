(function (global) {
    'use strict';

    // The PayPal button inside the Encounters unlock sheet (web). Injected into the sheet through its
    // mountActions hook, so the sheet never knows about payments. Nothing loads until a sheet opens.
    // A capture grants only when PayPal reports COMPLETED; the grant happens once per visit, so a second
    // approve cannot capture or grant again. Config, the checkout builders and the script loader are
    // injected, which keeps this module free of globals and testable without PayPal.
    const DESCRIPTION = 'Encounters unlock for this browser';

    // The order must be COMPLETED and have at least one capture, all of them COMPLETED. A PENDING
    // capture (an eCheck or a review hold) has not moved the money yet, so it does not unlock anything.
    function captureCompleted(details) {
        if (!details || details.status !== 'COMPLETED') return false;
        const unit = Array.isArray(details.purchase_units) ? details.purchase_units[0] : null;
        const captures = unit && unit.payments && Array.isArray(unit.payments.captures) ? unit.payments.captures : [];
        return captures.length > 0 && captures.every((capture) => capture && capture.status === 'COMPLETED');
    }

    function createEncounterPaypal({ h, config, checkout, loadScript, getSdk, note = '' }) {
        let sdkLoad = null;
        let granted = false;

        const enabled = () => !!(config && config.enabled && typeof config.clientId === 'string' && config.clientId.trim() !== '');

        // Loaded once; after a failure the next mount may try again.
        function loadSdk() {
            if (!sdkLoad) {
                const url = checkout.buildSdkUrl({ clientId: config.clientId, currency: config.currency });
                sdkLoad = Promise.resolve().then(() => loadScript(url)).catch((error) => {
                    sdkLoad = null;
                    throw error;
                });
            }
            return sdkLoad;
        }

        // Returns true when buttons are being prepared, false when payments are off.
        function mount(container, { onGranted = () => {}, onFailed = () => {}, onUnavailable = () => {} } = {}) {
            if (!enabled() || granted) return false;
            const slot = h('div', { class: 'encounter-paypal' });
            const noteEl = note ? h('p', { class: 'encounter-sheet-note', text: note }) : null;
            if (noteEl) container.append(noteEl);
            container.append(slot);
            loadSdk().then(() => checkout.renderButtons(getSdk(), slot, {
                    amount: config.amount,
                    currency: config.currency,
                    description: DESCRIPTION,
                    onApproved: (details) => {
                        if (granted) return;
                        if (!captureCompleted(details)) { onFailed(); return; }
                        granted = true;
                        onGranted(details);
                    },
                    onError: () => { if (!granted) onFailed(); },
            })).catch(() => {
                // No SDK, or the buttons could not render: drop the note and slot, and offer the Play link instead.
                if (noteEl) noteEl.remove();
                slot.remove();
                onUnavailable();
            });
            return true;
        }

        // A malformed locale must not break the sheet: the price falls back to English.
        function formatPrice(locale) {
            const options = { style: 'currency', currency: config.currency };
            try {
                return new Intl.NumberFormat(locale, options).format(config.amount);
            } catch (error) {
                return new Intl.NumberFormat('en', options).format(config.amount);
            }
        }

        // The label of the support button: the price is formatted for the reader's language and currency.
        function supportLabel(template, locale) {
            const price = formatPrice(locale);
            return String(template).replace('{price}', () => price);
        }

        return { mount, isEnabled: enabled, supportLabel };
    }

    global.EncounterPaypal = { createEncounterPaypal };
})(window);

(function (global) {
    'use strict';

    // The PayPal button inside the Encounters unlock sheet (web). Injected into the sheet through its
    // mountActions hook, so the sheet never knows about payments. Nothing loads until a sheet opens.
    // A capture grants only when PayPal reports COMPLETED; the grant happens once per visit, so a second
    // approve cannot capture or grant again. Config, the checkout builders and the script loader are
    // injected, which keeps this module free of globals and testable without PayPal.
    const DESCRIPTION = 'Encounters unlock for this browser';

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
            if (note) container.append(h('p', { class: 'encounter-sheet-note', text: note }));
            container.append(slot);
            loadSdk().then(() => {
                checkout.renderButtons(getSdk(), slot, {
                    amount: config.amount,
                    currency: config.currency,
                    description: DESCRIPTION,
                    onApproved: (details) => {
                        if (granted) return;
                        if (!details || details.status !== 'COMPLETED') { onFailed(); return; }
                        granted = true;
                        onGranted(details);
                    },
                    onError: () => { if (!granted) onFailed(); },
                });
            }).catch(() => {
                slot.remove();
                onUnavailable(); // no SDK: the sheet offers its Play link instead
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

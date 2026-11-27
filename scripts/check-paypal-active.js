#!/usr/bin/env node
// CI guard: config/paypal.active must say "production" on anything that reaches main, so /apoyanos/ can
// never ship with the PayPal sandbox. Feature branches may keep "sandbox"; CI only runs this for main.
//
// Usage: node scripts/check-paypal-active.js [path-to-paypal.active]   exits 1 unless the value is production

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FILE = path.join(__dirname, '..', 'config', 'paypal.active');
const REQUIRED = 'production';

function checkActiveForMain(content) {
    const value = content.trim();
    if (value === REQUIRED) return { ok: true, message: `PayPal environment is ${REQUIRED}.` };
    return {
        ok: false,
        message: `config/paypal.active is "${value}" but main requires "${REQUIRED}". Set it to ${REQUIRED} and run: node scripts/build-paypal-config.js`,
    };
}

if (require.main === module) {
    try {
        const result = checkActiveForMain(fs.readFileSync(process.argv[2] || DEFAULT_FILE, 'utf8'));
        (result.ok ? console.log : console.error)(result.message);
        process.exit(result.ok ? 0 : 1);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}

module.exports = { checkActiveForMain };

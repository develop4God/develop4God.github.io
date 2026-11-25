#!/usr/bin/env node
// Generates js/paypal-config.js (window.PayPalConfig) from the mirrored settings files
// config/paypal.sandbox.yml and config/paypal.production.yml. config/paypal.active names the
// environment the site is deployed with: change that one word, rebuild, commit. Both files keep
// the same keys, so switching never changes the shape the page reads.
//
// Usage: node scripts/build-paypal-config.js            writes js/paypal-config.js for the active environment
//        node scripts/build-paypal-config.js --check    exits 1 when the committed file is out of date

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CONFIG_DIR = 'config';
const ACTIVE_FILE = `${CONFIG_DIR}/paypal.active`;
const OUTPUT_FILE = 'js/paypal-config.js';
const ENVIRONMENTS = ['sandbox', 'production'];

function parseScalar(text, lineNumber) {
    if (text === '""') return '';
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    if (text.startsWith('[') && text.endsWith(']')) {
        const inner = text.slice(1, -1).trim();
        return inner === '' ? [] : inner.split(',').map((item) => parseScalar(item.trim(), lineNumber));
    }
    if (/^["'[{|>&*!%@`]/.test(text) || text === '') throw new Error(`Unsupported value on line ${lineNumber}: ${text}`);
    return text;
}

// A deliberately small YAML subset (no dependency, the site has no bundler): "key: value" lines, comments,
// quoted empty strings, inline lists of numbers, and one nested level of keys. Anything else throws.
function parseYaml(source) {
    const result = {};
    let section = null;
    source.split('\n').forEach((rawLine, index) => {
        const lineNumber = index + 1;
        const line = rawLine.replace(/\s+#.*$/, '').replace(/^#.*$/, '').trimEnd();
        if (line.includes('\t')) throw new Error(`Tab character on line ${lineNumber}: indent with spaces`);
        if (line.trim() === '') return;
        const nested = line.startsWith('  ');
        const match = /^( {2})?([A-Za-z_][A-Za-z0-9_]*):(?: (.*))?$/.exec(line);
        if (!match) throw new Error(`Cannot read line ${lineNumber}: ${rawLine}`);
        const [, , key, value] = match;
        if (nested) {
            if (section === null) throw new Error(`Unexpected indentation on line ${lineNumber}`);
            if (value === undefined) throw new Error(`Nesting deeper than one level on line ${lineNumber}`);
            if (key in result[section]) throw new Error(`Duplicate key ${section}.${key} on line ${lineNumber}`);
            result[section][key] = parseScalar(value, lineNumber);
            return;
        }
        if (key in result) throw new Error(`Duplicate key ${key} on line ${lineNumber}`);
        if (value === undefined) {
            result[key] = {};
            section = key;
        } else {
            result[key] = parseScalar(value, lineNumber);
            section = null;
        }
    });
    return result;
}

function loadConfig(environment) {
    if (!ENVIRONMENTS.includes(environment)) {
        throw new Error(`Unknown PayPal environment "${environment}": use ${ENVIRONMENTS.join(' or ')}`);
    }
    const file = `${CONFIG_DIR}/paypal.${environment}.yml`;
    return { file, raw: parseYaml(fs.readFileSync(path.join(ROOT, file), 'utf8')) };
}

function activeEnvironment() {
    return fs.readFileSync(path.join(ROOT, ACTIVE_FILE), 'utf8').trim();
}

const isWhole = (value) => Number.isInteger(value) && value > 0;

// The donor's amount is the plan quantity, so every amount setting must be a positive whole number and the
// range must make sense: a typo here would otherwise ship a page that rejects every amount.
function validateAmounts(file, raw) {
    const fail = (key, why) => { throw new Error(`${file}: ${key} ${why}`); };
    if (typeof raw.unit_price !== 'number' || !(raw.unit_price > 0)) fail('unit_price', 'must be a positive number');
    if (!isWhole(raw.minimum_amount)) fail('minimum_amount', 'must be a positive whole number');
    if (!isWhole(raw.maximum_amount) || raw.maximum_amount < raw.minimum_amount) fail('maximum_amount', 'must be a whole number at or above minimum_amount');
    const inRange = (amount) => isWhole(amount) && amount >= raw.minimum_amount && amount <= raw.maximum_amount;
    if (!Array.isArray(raw.preset_amounts) || !raw.preset_amounts.every(inRange)) fail('preset_amounts', 'must be whole numbers between minimum_amount and maximum_amount');
    if (typeof raw.currency !== 'string' || !/^[A-Z]{3}$/.test(raw.currency)) fail('currency', 'must be a three-letter uppercase code');
}

// Refuses an environment that is not ready to deploy: an empty id would ship a donate button that fails.
function toPublicConfig(environment, { file, raw }) {
    const required = ['client_id', 'currency', 'unit_price', 'minimum_amount', 'maximum_amount', 'preset_amounts', 'plans.monthly', 'plans.yearly'];
    const missing = required.filter((keyPath) => {
        const value = keyPath.split('.').reduce((node, key) => (node === undefined ? undefined : node[key]), raw);
        return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    });
    if (missing.length) throw new Error(`${environment} is not ready (${file}): fill in ${missing.join(', ')}`);
    if (raw.environment !== environment) throw new Error(`${file} says environment "${raw.environment}", expected "${environment}"`);
    validateAmounts(file, raw);
    return {
        environment,
        clientId: raw.client_id,
        currency: raw.currency,
        unitPrice: raw.unit_price,
        minimumAmount: raw.minimum_amount,
        maximumAmount: raw.maximum_amount,
        presetAmounts: raw.preset_amounts,
        plans: { monthly: raw.plans.monthly, yearly: raw.plans.yearly },
    };
}

function render(environment) {
    const config = toPublicConfig(environment, loadConfig(environment));
    return [
        `// Generated by scripts/build-paypal-config.js from config/paypal.${environment}.yml. Do not edit by hand:`,
        '// change config/paypal.active or the YAML, then run node scripts/build-paypal-config.js.',
        `window.PayPalConfig = Object.freeze(${JSON.stringify(config, null, 4)});`,
        '',
    ].join('\n');
}

function main(argv) {
    const check = argv.includes('--check');
    const next = render(activeEnvironment());
    const file = path.join(ROOT, OUTPUT_FILE);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (check) {
        if (current === next) return 0;
        console.error(`${OUTPUT_FILE} out of date. Run: node scripts/build-paypal-config.js`);
        return 1;
    }
    if (current !== next) fs.writeFileSync(file, next);
    return 0;
}

if (require.main === module) {
    try {
        process.exit(main(process.argv.slice(2)));
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}

module.exports = { parseYaml, loadConfig, render, activeEnvironment, toPublicConfig, OUTPUT_FILE, ENVIRONMENTS };

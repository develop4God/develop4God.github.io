'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseYaml, loadConfig, render, activeEnvironment, OUTPUT_FILE, ENVIRONMENTS } = require('./build-paypal-config.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// The key paths of a parsed config, e.g. ['plans.monthly', 'client_id'], sorted.
function keyPaths(value, prefix = '') {
    return Object.entries(value)
        .flatMap(([key, child]) => (child && typeof child === 'object' && !Array.isArray(child)
            ? keyPaths(child, `${prefix}${key}.`)
            : [`${prefix}${key}`]))
        .sort();
}

test('parseYaml reads scalars, quoted empty strings, inline lists and one nested level', () => {
    const parsed = parseYaml([
        '# a comment',
        'environment: sandbox',
        'client_id: ""',
        'minimum_amount: 5',
        'preset_amounts: [5, 10, 25]',
        'plans:',
        '  monthly: P-1   # trailing comment',
        '  yearly: P-2',
    ].join('\n'));
    assert.deepEqual(parsed, {
        environment: 'sandbox',
        client_id: '',
        minimum_amount: 5,
        preset_amounts: [5, 10, 25],
        plans: { monthly: 'P-1', yearly: 'P-2' },
    });
});

test('parseYaml rejects syntax outside the supported subset', () => {
    assert.throws(() => parseYaml('just a line'), /line 1/);
    assert.throws(() => parseYaml('a:\n  b:\n    c: 1'), /deeper than one level on line 2/);
    assert.throws(() => parseYaml('a: 1\na: 2'), /duplicate/i);
    assert.throws(() => parseYaml('\ta: 1'), /tab/i);
    assert.throws(() => parseYaml('  orphan: 1'), /line 1/);
});

test('the sandbox and production files are mirrors: same keys, each naming its own environment', () => {
    const sandbox = loadConfig('sandbox');
    const production = loadConfig('production');
    assert.deepEqual(keyPaths(sandbox.raw), keyPaths(production.raw));
    assert.equal(sandbox.raw.environment, 'sandbox');
    assert.equal(production.raw.environment, 'production');
});

test('the donor amount model is identical in both environments', () => {
    const sandbox = loadConfig('sandbox').raw;
    const production = loadConfig('production').raw;
    for (const key of ['currency', 'unit_price', 'minimum_amount', 'maximum_amount', 'preset_amounts']) {
        assert.deepEqual(sandbox[key], production[key], `${key} differs between the mirrors`);
    }
    assert.equal(sandbox.minimum_amount, 5);
    assert.ok(sandbox.maximum_amount >= Math.max(...sandbox.preset_amounts));
    assert.ok(sandbox.preset_amounts.every((amount) => Number.isInteger(amount) && amount >= sandbox.minimum_amount));
});

test('the sandbox config renders a frozen PayPalConfig without internal-only keys', () => {
    const output = render('sandbox');
    assert.match(output, /window\.PayPalConfig = Object\.freeze\(/);
    assert.match(output, /"environment": "sandbox"/);
    assert.match(output, /"minimumAmount": 5/);
    assert.doesNotMatch(output, /product_id|productId/);
});

test('an incomplete environment cannot be built: production has empty ids until the live plans exist', () => {
    const production = loadConfig('production').raw;
    const empty = ['client_id', 'plans.monthly', 'plans.yearly'].filter((p) => !p.split('.').reduce((o, k) => o[k], production));
    if (empty.length) {
        assert.throws(() => render('production'), /production.*(client_id|plans)/);
    } else {
        assert.doesNotThrow(() => render('production'));
    }
});

test('an unknown environment is refused', () => {
    assert.throws(() => loadConfig('staging'), /staging/);
    assert.deepEqual([...ENVIRONMENTS].sort(), ['production', 'sandbox']);
});

test('the active environment file names a known environment', () => {
    assert.ok(ENVIRONMENTS.includes(activeEnvironment()));
});

test('the committed generated config matches the active environment (run node scripts/build-paypal-config.js)', () => {
    assert.equal(read(OUTPUT_FILE), render(activeEnvironment()));
});

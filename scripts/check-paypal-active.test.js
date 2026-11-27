'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkActiveForMain } = require('./check-paypal-active.js');

const SCRIPT = path.join(__dirname, 'check-paypal-active.js');

test('production passes, with or without trailing whitespace and newline', () => {
    for (const content of ['production', 'production\n', '  production \r\n']) {
        assert.equal(checkActiveForMain(content).ok, true, JSON.stringify(content));
    }
});

test('sandbox is rejected, however it is padded', () => {
    for (const content of ['sandbox', 'sandbox\n', ' sandbox \r\n']) {
        const result = checkActiveForMain(content);
        assert.equal(result.ok, false, JSON.stringify(content));
        assert.match(result.message, /sandbox/);
    }
});

test('an unknown or empty value is rejected, not silently accepted', () => {
    for (const content of ['staging', '', '\n', 'Production', 'production sandbox']) {
        assert.equal(checkActiveForMain(content).ok, false, JSON.stringify(content));
    }
});

function runCli(content) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paypal-active-'));
    try {
        const file = path.join(dir, 'paypal.active');
        if (content !== null) fs.writeFileSync(file, content);
        return spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('CLI exits 0 for production and 1 for sandbox, naming the problem on stderr', () => {
    assert.equal(runCli('production\n').status, 0);
    const bad = runCli('sandbox\n');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /sandbox/);
});

test('CLI exits 1 when the file is missing', () => {
    const result = runCli(null);
    assert.equal(result.status, 1);
    assert.notEqual(result.stderr, '');
});

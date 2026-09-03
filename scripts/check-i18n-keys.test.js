'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { flatten, checkDir } = require('./check-i18n-keys.js');

test('flatten: nested object keys become dot-separated paths', () => {
    const keys = flatten({ a: { b: 'x', c: { d: 'y' } }, e: 'z' });
    assert.deepEqual(keys.sort(), ['a.b', 'a.c.d', 'e']);
});

test('flatten: arrays are treated as leaf values, not recursed into', () => {
    const keys = flatten({ a: ['one', 'two'] });
    assert.deepEqual(keys, ['a']);
});

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-check-test-'));
}

function writeJson(dir, filename, data) {
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(data), 'utf8');
}

test('checkDir: reports no drift when every file has the same keys', () => {
    const dir = makeTempDir();
    writeJson(dir, 'en.json', { a: 'x', b: { c: 'y' } });
    writeJson(dir, 'es.json', { a: 'x2', b: { c: 'y2' } });

    const report = checkDir(dir);

    assert.equal(report.fileCount, 2);
    assert.equal(report.unionSize, 2);
    assert.deepEqual(report.results, []);
    assert.deepEqual(report.parseErrors, []);

    fs.rmSync(dir, { recursive: true });
});

test('checkDir: flags a file missing a key another file has (union-based, not canonical-based)', () => {
    const dir = makeTempDir();
    writeJson(dir, 'en.json', { a: 'x' });
    writeJson(dir, 'es.json', { a: 'x2', b: 'extra' });

    const report = checkDir(dir);

    assert.equal(report.unionSize, 2);
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].file, 'en.json');
    assert.deepEqual(report.results[0].missing, ['b']);

    fs.rmSync(dir, { recursive: true });
});

test('checkDir: reports every locale as missing keys unique to just one locale', () => {
    const dir = makeTempDir();
    writeJson(dir, 'en.json', { a: 'x' });
    writeJson(dir, 'es.json', { a: 'x2' });
    writeJson(dir, 'hi.json', { a: 'x3', dead: { key: 'leftover' } });

    const report = checkDir(dir);

    assert.equal(report.unionSize, 2);
    const missingFiles = report.results.map((r) => r.file).sort();
    assert.deepEqual(missingFiles, ['en.json', 'es.json']);
    for (const r of report.results) {
        assert.deepEqual(r.missing, ['dead.key']);
    }

    fs.rmSync(dir, { recursive: true });
});

test('checkDir: reports a parse error for invalid JSON without throwing', () => {
    const dir = makeTempDir();
    writeJson(dir, 'en.json', { a: 'x' });
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not valid json', 'utf8');

    const report = checkDir(dir);

    assert.equal(report.parseErrors.length, 1);
    assert.equal(report.parseErrors[0].file, 'broken.json');

    fs.rmSync(dir, { recursive: true });
});

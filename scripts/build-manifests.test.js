'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildManifest, languages, OUTPUT_DIR, render } = require('./build-manifests.js');

const ROOT = path.join(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'devocionales/manifest.webmanifest'), 'utf8'));

test('one manifest per language file, and the committed files are up to date', () => {
    const codes = languages();
    assert.ok(codes.length >= 10);
    for (const code of codes) {
        const file = path.join(ROOT, OUTPUT_DIR, `${code}.webmanifest`);
        assert.ok(fs.existsSync(file), `${code}.webmanifest is missing: run node scripts/build-manifests.js`);
        assert.equal(fs.readFileSync(file, 'utf8'), render(code), `${code}.webmanifest is stale`);
    }
});

test('the app name is the translated title, for the name and the launcher label', () => {
    const zh = buildManifest(base, '基督徒灵修', 'zh');
    assert.equal(zh.name, '基督徒灵修');
    assert.equal(zh.short_name, '基督徒灵修');
    assert.equal(buildManifest(base, 'ईसाई भक्ति', 'hi').name, 'ईसाई भक्ति');
});

test('every language is the same installed app: identity, scope and icons never change', () => {
    for (const code of languages()) {
        const m = JSON.parse(fs.readFileSync(path.join(ROOT, OUTPUT_DIR, `${code}.webmanifest`), 'utf8'));
        assert.equal(m.id, base.id, code);
        assert.equal(m.scope, base.scope, code);
        assert.equal(m.start_url, base.start_url, code);
        assert.deepEqual(m.icons, base.icons, code);
        assert.equal(m.lang, code);
        assert.ok(m.name && m.name.length > 0, code);
    }
});

test('right-to-left languages say so', () => {
    assert.equal(buildManifest(base, 'x', 'ar').dir, 'rtl');
    assert.equal(buildManifest(base, 'x', 'en').dir, undefined);
});

test('a language file without a title is an error, not a blank app name', () => {
    assert.throws(() => buildManifest(base, '', 'xx'), /title/i);
    assert.throws(() => buildManifest(base, undefined, 'xx'), /title/i);
});

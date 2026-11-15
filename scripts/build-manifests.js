#!/usr/bin/env node
// Generates one web app manifest per language from the base manifest and the translated app
// title (header.title in lang/devocionales/<code>.json). A manifest holds a single name, so the
// installed app's name is localized by serving the manifest of the page's language
// (devocionales/js/devotional-manifest.js picks it). Identity, scope, start URL and icons are
// copied unchanged, so every language is the same installed app.
//
// Usage: node scripts/build-manifests.js            writes devocionales/manifests/<code>.webmanifest
//        node scripts/build-manifests.js --check    exits 1 when a committed file is out of date

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BASE_FILE = 'devocionales/manifest.webmanifest';
const LANG_DIR = 'lang/devocionales';
const OUTPUT_DIR = 'devocionales/manifests';
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

function languages() {
    return fs.readdirSync(path.join(ROOT, LANG_DIR))
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
        .sort();
}

function buildManifest(base, title, code) {
    if (typeof title !== 'string' || title.trim() === '') {
        throw new Error(`${LANG_DIR}/${code}.json has no header.title: it is the installed app's name`);
    }
    const manifest = { ...base, name: title, short_name: title, lang: code };
    if (RTL.has(code)) manifest.dir = 'rtl';
    return manifest;
}

function render(code) {
    const base = JSON.parse(fs.readFileSync(path.join(ROOT, BASE_FILE), 'utf8'));
    const strings = JSON.parse(fs.readFileSync(path.join(ROOT, LANG_DIR, `${code}.json`), 'utf8'));
    return `${JSON.stringify(buildManifest(base, strings.header && strings.header.title, code), null, 2)}\n`;
}

function main(argv) {
    const check = argv.includes('--check');
    const stale = [];
    if (!check) fs.mkdirSync(path.join(ROOT, OUTPUT_DIR), { recursive: true });
    for (const code of languages()) {
        const file = path.join(ROOT, OUTPUT_DIR, `${code}.webmanifest`);
        const next = render(code);
        const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
        if (current === next) continue;
        stale.push(file);
        if (!check) fs.writeFileSync(file, next);
    }
    if (check && stale.length) {
        console.error(`Stale manifests (run: node scripts/build-manifests.js):\n${stale.join('\n')}`);
        return 1;
    }
    return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { buildManifest, languages, render, OUTPUT_DIR };

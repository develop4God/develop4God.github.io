#!/usr/bin/env node
'use strict';

// Generates devocionales/sw.js from scripts/sw.template.js.
//
// The worker precaches the whole page shell so the reader opens offline. This script works out
// that list from the page itself (its scripts, stylesheets, fonts, manifest icons and language
// files), so a new asset is picked up without editing a second list, and fails the build when a
// referenced file does not exist. The cache version is a hash of every precached file plus the
// template, so any change to the page ships a new worker.
//
// Usage: node scripts/build-sw.js            writes devocionales/sw.js
//        node scripts/build-sw.js --check    exits 1 when the committed sw.js is out of date

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PLACEHOLDER = '__SW_CONFIG__';
const SHELL_URL = '/devocionales/';
const SHELL_FILE = 'devocionales/index.html';
const MANIFEST_FILE = 'devocionales/manifest.webmanifest';
const LANG_DIR = 'lang/devocionales';
const TEMPLATE_FILE = 'scripts/sw.template.js';
const OUTPUT_FILE = 'devocionales/sw.js';
const WORKER_URL = '/devocionales/sw.js';
const LINK_RELS = new Set(['stylesheet', 'preload', 'modulepreload', 'manifest', 'apple-touch-icon', 'icon']);

// Runtime behaviour that is not derived from the page.
const RUNTIME = {
    timeoutMs: 4000,
    maxDataEntries: 24, // year files kept: a few languages and versions, current and previous year
    dataHost: 'raw.githubusercontent.com',
    // The devotional files, and the hero-image list (not the images themselves, which are opaque
    // no-cors <img> loads). The page waits for that list before rendering, so offline it must
    // answer from cache or the first paint stalls on the loader's retry backoff.
    dataPathPrefixes: [
        '/develop4God/Devocionales-json/',
        '/develop4God/Devocionales-assets/main/images/devotionals/index.json',
    ],
};

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const fileFor = (url) => (url === SHELL_URL ? SHELL_FILE : url.slice(1));

// A same-origin absolute path without its query or fragment, or null for anything else.
function localPath(reference) {
    if (!reference.startsWith('/') || reference.startsWith('//')) return null;
    return reference.split(/[?#]/)[0];
}

// A tag's attribute value, in double or single quotes.
function attribute(tag, name) {
    const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`));
    return match ? (match[1] ?? match[2]) : null;
}

function htmlReferences(html) {
    const live = html.replace(/<!--[\s\S]*?-->/g, ''); // a commented-out tag is not part of the page
    const scripts = [...live.matchAll(/<script\b[^>]*>/g)].map((m) => attribute(m[0], 'src'));
    const links = [...live.matchAll(/<link\b[^>]*>/g)]
        .filter((m) => (attribute(m[0], 'rel') || '').split(/\s+/).some((rel) => LINK_RELS.has(rel)))
        .map((m) => attribute(m[0], 'href'));
    return [...scripts, ...links].filter(Boolean);
}

// url(...) targets inside a stylesheet, resolved against the stylesheet's own URL.
function cssReferences(css, cssUrl) {
    const live = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...live.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)]
        .map((m) => m[1])
        .filter((ref) => !/^(data:|https?:|\/\/)/.test(ref))
        .map((ref) => new URL(ref, `http://x${cssUrl}`).pathname);
}

function collectPrecache(root) {
    const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
    const urls = new Set([SHELL_URL]);
    const requireFile = (url, origin) => {
        if (!fs.existsSync(path.join(root, fileFor(url)))) {
            throw new Error(`Precache entry ${url} (referenced by ${origin}) does not exist`);
        }
        urls.add(url);
    };

    for (const reference of htmlReferences(read(SHELL_FILE))) {
        const url = localPath(reference);
        if (url && url !== WORKER_URL) requireFile(url, SHELL_FILE);
    }
    for (const icon of JSON.parse(read(MANIFEST_FILE)).icons || []) {
        const url = localPath(icon.src);
        if (url) requireFile(url, MANIFEST_FILE);
    }
    for (const url of [...urls].filter((u) => u.endsWith('.css'))) {
        for (const font of cssReferences(read(fileFor(url)), url)) requireFile(font, url);
    }
    for (const name of fs.readdirSync(path.join(root, LANG_DIR)).filter((n) => n.endsWith('.json'))) {
        urls.add(`/${LANG_DIR}/${name}`);
    }
    return [...urls].sort();
}

// Covers everything that shapes the worker: its template, its runtime settings and every file it
// precaches, so changing any of them ships a new versioned cache and never rewrites one in place.
function computeVersion(root, urls, template, runtime) {
    const hash = crypto.createHash('sha256');
    hash.update(sha256(template));
    hash.update(`\n${JSON.stringify(runtime)}`);
    for (const url of urls) hash.update(`\n${url}\n${sha256(fs.readFileSync(path.join(root, fileFor(url))))}`);
    return hash.digest('hex').slice(0, 12);
}

// The replacement is a function so `$` sequences in the config are never read as patterns.
function renderSw(template, config) {
    const marker = `'${PLACEHOLDER}'`;
    if (!template.includes(marker)) throw new Error(`Worker template is missing the ${PLACEHOLDER} placeholder`);
    return template.replace(marker, () => JSON.stringify(JSON.stringify(config)));
}

function buildSw(root) {
    const template = fs.readFileSync(path.join(root, TEMPLATE_FILE), 'utf8');
    const precache = collectPrecache(root);
    const config = { version: computeVersion(root, precache, template, RUNTIME), ...RUNTIME, precache };
    return { source: renderSw(template, config), config };
}

function main(root, args) {
    const { source } = buildSw(root);
    const target = path.join(root, OUTPUT_FILE);
    if (args.includes('--check')) {
        const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
        if (current !== source) {
            console.error(`${OUTPUT_FILE} is out of date. Run: node scripts/build-sw.js`);
            process.exit(1);
        }
        return;
    }
    fs.writeFileSync(target, source);
}

if (require.main === module) main(path.join(__dirname, '..'), process.argv.slice(2));

module.exports = { buildSw, collectPrecache, computeVersion, renderSw, PLACEHOLDER };

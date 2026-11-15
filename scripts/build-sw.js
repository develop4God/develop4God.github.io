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

const { parseTags } = require('./html-tags.js');

const PLACEHOLDER = '__SW_CONFIG__';
const SHELL_URL = '/devocionales/';
const PAGES_DIR = 'devocionales';
const SHELL_FILE = `${PAGES_DIR}/index.html`;
const MANIFEST_FILE = 'devocionales/manifest.webmanifest';
const LANG_DIR = 'lang/devocionales';
const TEMPLATE_FILE = 'scripts/sw.template.js';
const OUTPUT_FILE = 'devocionales/sw.js';
const WORKER_URL = '/devocionales/sw.js';
const LINK_RELS = new Set(['stylesheet', 'preload', 'modulepreload', 'manifest', 'apple-touch-icon', 'icon']);

// Runtime behaviour that is not derived from the page.
const RUNTIME = {
    installAttempts: 3, // tries per precached file before an install gives up
    installRetryDelayMs: 500, // grows with each retry
    timeoutMs: 4000,
    freshTimeoutMs: 1000, // the page blocks on the config script, so it waits less than the data does
    maxDataEntries: 24, // year files kept: a few languages and versions, current and previous year
    // Hero images: saved on first view. Their list (index.json, above) is data; the images are not.
    imagePathPrefix: '/develop4God/Devocionales-assets/main/images/devotionals/',
    maxImageEntries: 30,
    // Precached, but fetched fresh first so switching the PWA off does not wait for a worker update.
    freshFirst: ['/devocionales/js/devotional-pwa-config.js'],
    // Same-origin files fetched live and kept only as an offline fallback.
    sameOriginData: ['/data/app-stats.json'],
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

// Everything a page loads by tag: scripts, images, the link rels that matter, and the url()
// references inside its inline <style> blocks (resolved against the page's own URL). Throws when
// the markup cannot be parsed (see html-tags.js).
function htmlReferences(html, pageUrl) {
    const references = [];
    for (const tag of parseTags(html)) {
        if (tag.name === 'script' || tag.name === 'img') references.push(tag.attrs.src);
        else if (tag.name === 'link' && (tag.attrs.rel || '').split(/\s+/).some((rel) => LINK_RELS.has(rel))) references.push(tag.attrs.href);
        else if (tag.name === 'style') references.push(...cssReferences(tag.body, pageUrl));
    }
    return references.filter(Boolean);
}

// url(...) targets inside a stylesheet, resolved against the stylesheet's own URL.
function cssReferences(css, cssUrl) {
    const live = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...live.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)]
        .map((m) => m[1])
        .filter((ref) => !/^(data:|https?:|\/\/)/.test(ref))
        .map((ref) => new URL(ref, `http://x${cssUrl}`).pathname);
}

// devocionales/index.html first, then the other .html pages in that folder, sorted.
function pageFiles(root) {
    const others = fs.readdirSync(path.join(root, PAGES_DIR))
        .filter((name) => name.endsWith('.html') && `${PAGES_DIR}/${name}` !== SHELL_FILE)
        .sort()
        .map((name) => `${PAGES_DIR}/${name}`);
    return [SHELL_FILE, ...others];
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

    // The shell, then every other page in devocionales/ (the legal pages): each page is precached
    // itself and so is everything it loads.
    for (const page of pageFiles(root)) {
        if (page !== SHELL_FILE) urls.add(`/${page}`);
        const pageUrl = page === SHELL_FILE ? SHELL_URL : `/${page}`;
        let references;
        try {
            references = htmlReferences(read(page), pageUrl);
        } catch (err) {
            throw new Error(`${page}: ${err.message}`);
        }
        for (const reference of references) {
            const url = localPath(reference);
            if (url && url !== WORKER_URL) requireFile(url, page);
        }
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

// `overrides` replaces runtime settings; it exists so tests can exercise the validation below.
function buildSw(root, overrides = {}) {
    const runtime = { ...RUNTIME, ...overrides };
    const template = fs.readFileSync(path.join(root, TEMPLATE_FILE), 'utf8');
    const precache = collectPrecache(root);
    for (const url of runtime.freshFirst) {
        if (!precache.includes(url)) throw new Error(`freshFirst path ${url} is not in the precache list`);
    }
    // The pages other than the shell, which the worker serves for navigations: the same list
    // collectPrecache walked, so the two can never disagree about what a page is.
    const pages = pageFiles(root).filter((file) => file !== SHELL_FILE).map((file) => `/${file}`);
    const config = { version: computeVersion(root, precache, template, runtime), ...runtime, pages, precache };
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

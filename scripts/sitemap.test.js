'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseTags } = require('./html-tags.js');

const ROOT = path.join(__dirname, '..');
const HOST = 'https://develop4god.com';
const SKIPPED_DIRS = new Set(['.git', '.claude', 'node_modules', 'coverage', 'test-results', 'legacy', 'lychee', 'e2e']);

function htmlFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : htmlFiles(path.join(dir, entry.name));
        return entry.name.endsWith('.html') ? [path.join(dir, entry.name)] : [];
    });
}

// The canonical URL each indexable page declares for itself.
function canonicals() {
    const urls = [];
    for (const file of htmlFiles(ROOT)) {
        const tags = parseTags(fs.readFileSync(file, 'utf8'));
        const noindex = tags.some((t) => t.name === 'meta' && t.attrs.name === 'robots' && /noindex/i.test(t.attrs.content || ''));
        const canonical = tags.find((t) => t.name === 'link' && t.attrs.rel === 'canonical');
        if (canonical && !noindex) urls.push(canonical.attrs.href);
    }
    return urls;
}

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

test('sitemap lists exactly the canonical URL of every indexable page', () => {
    assert.deepEqual([...locs].sort(), canonicals().sort());
});

test('sitemap URLs are unique, https, on the apex host, and never an .html or index variant', () => {
    assert.equal(new Set(locs).size, locs.length);
    for (const loc of locs) {
        assert.ok(loc.startsWith(`${HOST}/`), `${loc} is not on ${HOST}`);
        assert.doesNotMatch(loc, /\.html$|\/index$|[?#]/, `${loc} is a non-canonical variant`);
    }
});

test('the sitemap file is well-formed enough to open and close the urlset', () => {
    assert.match(sitemap, /^<\?xml[^>]*\?>\s*<urlset [^>]*>/);
    assert.match(sitemap, /<\/urlset>\s*$/);
});

test('robots.txt allows crawling and points to the sitemap on the apex host', () => {
    const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
    assert.match(robots, /^User-agent: \*$/m);
    assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m);
    assert.match(robots, new RegExp(`^Sitemap: ${HOST}/sitemap\\.xml$`, 'm'));
});

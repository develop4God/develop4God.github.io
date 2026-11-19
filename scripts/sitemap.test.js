'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { parseTags } = require('./html-tags.js');

const ROOT = path.join(__dirname, '..');
const HOST = 'https://develop4god.com';

// Tracked pages only, so generated or vendored folders never count as site pages.
function htmlFiles() {
    const listed = execFileSync('git', ['ls-files', '-z', '*.html'], { cwd: ROOT, encoding: 'utf8' });
    return listed.split('\0').filter((file) => file && !file.startsWith('legacy/')).map((file) => path.join(ROOT, file));
}

// The canonical URL each indexable page declares for itself.
function canonicals() {
    const urls = [];
    for (const file of htmlFiles()) {
        const tags = parseTags(fs.readFileSync(file, 'utf8'));
        const noindex = tags.some((t) => t.name === 'meta' && (t.attrs.name || '').toLowerCase() === 'robots' && /noindex/i.test(t.attrs.content || ''));
        const canonical = tags.find((t) => t.name === 'link' && (t.attrs.rel || '').trim().toLowerCase() === 'canonical');
        if (canonical && !noindex) urls.push(canonical.attrs.href);
    }
    return urls;
}

const readSitemap = () => fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const sitemapLocs = () => [...readSitemap().matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

test('sitemap lists exactly the canonical URL of every indexable page', () => {
    assert.deepEqual(sitemapLocs().sort(), canonicals().sort());
});

test('sitemap URLs are unique, https, on the apex host, and never an .html or index variant', () => {
    const locs = sitemapLocs();
    assert.equal(new Set(locs).size, locs.length);
    for (const loc of locs) {
        assert.ok(loc.startsWith(`${HOST}/`), `${loc} is not on ${HOST}`);
        assert.doesNotMatch(loc, /\.html$|\/index$|[?#]/, `${loc} is a non-canonical variant`);
    }
});

test('the sitemap file is well-formed enough to open and close the urlset', () => {
    const sitemap = readSitemap();
    assert.match(sitemap, /^<\?xml[^>]*\?>\s*<urlset [^>]*>/);
    assert.match(sitemap, /<\/urlset>\s*$/);
});

test('robots.txt allows crawling and points to the sitemap on the apex host', () => {
    const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
    assert.match(robots, /^User-agent: \*$/m);
    assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m);
    assert.match(robots, new RegExp(`^Sitemap: ${HOST}/sitemap\\.xml$`, 'm'));
});

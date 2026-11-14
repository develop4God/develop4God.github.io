'use strict';

// The old Tailwind Play CDN generated CSS for any class found in the live DOM. The committed
// build only sees the files listed in scripts/tailwind.config.cjs, so a script added to
// devocionales/index.html but missing from that list would silently lose its classes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { content } = require('./tailwind.config.cjs');

const ROOT = path.join(__dirname, '..');
const VENDORED = '/devocionales/vendor/';

// Local (same-origin, absolute-path) <script src> values, as repo-relative paths.
function localScriptSources(html) {
    const sources = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    return sources
        .filter((src) => src.startsWith('/') && !src.startsWith('//'))
        .filter((src) => !src.startsWith(VENDORED))
        .map((src) => src.slice(1));
}

// Supports the two pattern shapes the config uses: an exact path and `dir/*.ext`.
function matches(pattern, file) {
    if (!pattern.includes('*')) return pattern === file;
    const [dir, glob] = [path.posix.dirname(pattern), path.posix.basename(pattern)];
    const regex = new RegExp(`^${glob.replace(/[.]/g, '\\.').replace(/\*/g, '[^/]*')}$`);
    return path.posix.dirname(file) === dir && regex.test(path.posix.basename(file));
}

function isCovered(patterns, file) {
    const included = patterns.filter((p) => !p.startsWith('!')).some((p) => matches(p, file));
    const excluded = patterns.filter((p) => p.startsWith('!')).some((p) => matches(p.slice(1), file));
    return included && !excluded;
}

test('every local script devocionales/index.html loads is scanned by Tailwind', () => {
    const html = fs.readFileSync(path.join(ROOT, 'devocionales/index.html'), 'utf8');
    const sources = localScriptSources(html);
    assert.ok(sources.length > 10, 'expected to find the page scripts');
    const uncovered = sources.filter((src) => !isCovered(content, src));
    assert.deepEqual(uncovered, []);
});

test('isCovered: a script missing from the content list is reported', () => {
    assert.equal(isCovered(content, 'js/brand-new-widget.js'), false);
    assert.equal(isCovered(content, 'devocionales/js/sub/nested.js'), false);
});

test('isCovered: listed scripts match, and negated test files are excluded', () => {
    assert.equal(isCovered(content, 'devocionales/js/devotional-loader.js'), true);
    assert.equal(isCovered(content, 'js/site-footer.js'), true);
    assert.equal(isCovered(content, 'devocionales/js/i18n.test.js'), false);
});

test('localScriptSources: ignores inline, protocol-relative, external and vendored scripts', () => {
    const html = [
        '<script>inline()</script>',
        '<script async src="https://www.googletagmanager.com/gtag/js?id=X"></script>',
        '<script src="//cdn.example.com/a.js"></script>',
        '<script src="/devocionales/vendor/lucide.min.js"></script>',
        '<script src="/js/site-footer.js"></script>',
    ].join('\n');
    assert.deepEqual(localScriptSources(html), ['js/site-footer.js']);
});

test('localScriptSources: a page without scripts yields nothing', () => {
    assert.deepEqual(localScriptSources('<html><body>hi</body></html>'), []);
});

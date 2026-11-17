'use strict';

// The devocionales reader renders remote content, so it ships a Content-Security-Policy. Inline
// scripts are allowed by SHA-256 hash, which silently stops matching when someone edits one: these
// checks recompute the hashes from the pages so a drifted hash fails here, not in a visitor's browser.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { headersFor } = require('./headers-file');
const { parseTags } = require('./html-tags');

const ROOT = path.join(__dirname, '..');
const POLICY_PATH = '/devocionales/*';
const HEADER = 'content-security-policy-report-only';

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function htmlFiles(dir) {
    return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const relative = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'vendor' ? [] : htmlFiles(relative);
        return entry.name.endsWith('.html') ? [relative] : [];
    });
}

// Directive name -> source tokens, e.g. "script-src 'self' https://x" -> { 'script-src': ["'self'", 'https://x'] }.
function parsePolicy(policy) {
    return Object.fromEntries(policy.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
        const [name, ...tokens] = part.split(/\s+/);
        return [name, tokens];
    }));
}

const EXECUTABLE_TYPES = new Set(['', 'text/javascript', 'module']);

// CSP hash source of every inline script the browser would execute (JSON-LD and other data blocks are not).
function inlineScriptHashes(html) {
    return parseTags(html)
        .filter((tag) => tag.name === 'script' && !('src' in tag.attrs) && EXECUTABLE_TYPES.has((tag.attrs.type || '').toLowerCase()))
        .map((tag) => `'sha256-${crypto.createHash('sha256').update(tag.body, 'utf8').digest('base64')}'`);
}

const inlineHandlers = (html) => parseTags(html).flatMap((tag) => Object.keys(tag.attrs).filter((a) => a.startsWith('on')).map((a) => `${tag.name}[${a}]`));

const pages = htmlFiles('devocionales');
const policyText = headersFor(read('_headers'), POLICY_PATH)[HEADER];
const policy = parsePolicy(policyText || '');
const scriptSrc = policy['script-src'] || [];

test('the reader ships a report-only CSP on /devocionales/*', () => {
    assert.ok(policyText, `_headers has no ${HEADER} for ${POLICY_PATH}`);
});

test('script-src allows no unsafe-inline, unsafe-eval or wildcard source', () => {
    for (const token of scriptSrc) {
        assert.ok(!["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'http:', 'data:'].includes(token), `script-src must not allow ${token}`);
    }
});

test('the policy blocks plugins and base-tag hijacking and defaults to same-origin', () => {
    assert.deepEqual(policy['default-src'], ["'self'"]);
    assert.deepEqual(policy['object-src'], ["'none'"]);
    assert.deepEqual(policy['base-uri'], ["'self'"]);
});

test('every inline script in every devocionales page is allowed by hash', () => {
    assert.ok(pages.length >= 4, 'expected the reader, studies and legal pages');
    for (const page of pages) {
        for (const hash of inlineScriptHashes(read(page))) {
            assert.ok(scriptSrc.includes(hash), `${page}: inline script ${hash} is missing from script-src (edited it? update _headers)`);
        }
    }
});

test('script-src carries no hash that no page uses any more', () => {
    const used = new Set(pages.flatMap((page) => inlineScriptHashes(read(page))));
    for (const token of scriptSrc.filter((t) => t.startsWith("'sha256-"))) {
        assert.ok(used.has(token), `script-src allows ${token} but no page has that inline script`);
    }
});

test('no page uses an inline event handler attribute, which a script-src without unsafe-inline would block', () => {
    for (const page of pages) assert.deepEqual(inlineHandlers(read(page)), [], page);
});

test('inlineScriptHashes: hashes executable inline scripts only, and a changed body changes the hash', () => {
    const base = '<script>a()</script><script src="/x.js"></script><script type="application/ld+json">{}</script><script type="module">m()</script>';
    assert.equal(inlineScriptHashes(base).length, 2);
    assert.notDeepEqual(inlineScriptHashes('<script>a()</script>'), inlineScriptHashes('<script>a() </script>'));
    assert.deepEqual(inlineScriptHashes('<p>no scripts</p>'), []);
});

test('parsePolicy: splits directives and ignores empty parts', () => {
    assert.deepEqual(parsePolicy("default-src 'self'; ; script-src 'self' https://a.example;"), {
        'default-src': ["'self'"],
        'script-src': ["'self'", 'https://a.example'],
    });
    assert.deepEqual(parsePolicy(''), {});
});

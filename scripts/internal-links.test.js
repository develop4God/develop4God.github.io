'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { parseTags } = require('./html-tags.js');

const ROOT = path.join(__dirname, '..');

// Cloudflare Pages 308-redirects `page.html` to `page`, so a link to the .html form costs a hop and
// tells crawlers two URLs exist. Every internal link must use the canonical (extensionless) form.
function trackedHtml() {
    const listed = execFileSync('git', ['ls-files', '-z', '*.html'], { cwd: ROOT, encoding: 'utf8' });
    return listed.split('\0').filter((file) => file);
}

// An internal link is relative, root-relative, or absolute on the apex or www host.
const isInternal = (href) => !/^[a-z][a-z0-9+.-]*:/i.test(href) || /^https?:\/\/(www\.)?develop4god\.com(\/|$)/i.test(href);

test('no page links to a .html page or to the www host', () => {
    const offenders = [];
    for (const file of trackedHtml()) {
        for (const tag of parseTags(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
            const href = tag.name === 'a' ? (tag.attrs.href || '').trim() : '';
            if (!href || !isInternal(href)) continue;
            if (/\.html?([?#]|$)/i.test(href) || /^https?:\/\/www\./i.test(href)) offenders.push(`${file}: ${href}`);
        }
    }
    assert.deepEqual(offenders, []);
});

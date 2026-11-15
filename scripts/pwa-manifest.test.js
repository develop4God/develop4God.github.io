'use strict';

// The devocionales PWA is installable only if the manifest, its icons, the <head> tags and the
// served headers all agree. These checks fail loudly when one of them drifts.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCOPE = '/devocionales/';
const MANIFEST_PATH = '/devocionales/manifest.webmanifest';

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const manifest = JSON.parse(read(MANIFEST_PATH.slice(1)));

// Width and height from a PNG's IHDR chunk, so an icon cannot claim a size it does not have.
function pngSize(file) {
    const buffer = fs.readFileSync(file);
    assert.equal(buffer.toString('ascii', 1, 4), 'PNG', `${file} is not a PNG`);
    return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}

// The header block that applies to a path in a Cloudflare-style _headers file, as a map.
function headersFor(headersFile, urlPath) {
    const result = {};
    let current = null;
    for (const line of headersFile.split('\n')) {
        if (!line.trim()) continue;
        if (!/^\s/.test(line)) {
            current = line.trim();
            continue;
        }
        if (current !== urlPath) continue;
        const [name, ...value] = line.trim().split(':');
        result[name.toLowerCase()] = value.join(':').trim();
    }
    return result;
}

test('manifest identifies the app and stays inside its scope', () => {
    assert.equal(manifest.scope, SCOPE);
    assert.equal(manifest.id, SCOPE);
    assert.ok(manifest.start_url.startsWith(SCOPE), 'start_url must be within scope');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.name && manifest.short_name);
    assert.ok(manifest.short_name.length <= 12, 'short_name is truncated by launchers beyond ~12 chars');
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
});

test('every manifest icon exists and has exactly the size it declares', () => {
    assert.ok(manifest.icons.length >= 3);
    for (const icon of manifest.icons) {
        const file = path.join(ROOT, icon.src.replace(/^\//, ''));
        assert.ok(fs.existsSync(file), `${icon.src} is missing`);
        assert.equal(pngSize(file), icon.sizes, `${icon.src} size`);
        assert.equal(icon.type, 'image/png');
    }
});

test('icons cover installability: 192 and 512 "any", plus a 512 maskable', () => {
    const find = (sizes, purpose) => manifest.icons.find((i) => i.sizes === sizes && (i.purpose || 'any') === purpose);
    assert.ok(find('192x192', 'any'));
    assert.ok(find('512x512', 'any'));
    assert.ok(find('512x512', 'maskable'));
});

test('the native Android app is declared but not preferred over the PWA', () => {
    assert.equal(manifest.prefer_related_applications, false);
    assert.deepEqual(manifest.related_applications, [
        { platform: 'play', id: 'com.develop4god.devocional_nuevo' },
    ]);
});

test('index.html links the manifest, theme colour and touch icon, and they resolve', () => {
    const html = read('devocionales/index.html');
    assert.match(html, new RegExp(`<link rel="manifest" href="${MANIFEST_PATH}"`));
    assert.match(html, new RegExp(`<meta name="theme-color" content="${manifest.theme_color}"`, 'i'));
    const touch = html.match(/<link rel="apple-touch-icon" href="([^"]+)"/);
    assert.ok(touch, 'apple-touch-icon link is missing');
    assert.equal(pngSize(path.join(ROOT, touch[1].slice(1))), '180x180');
});

test('_headers: the worker is never cached and the manifest has its own media type', () => {
    const headers = read('_headers');
    assert.equal(headersFor(headers, '/devocionales/sw.js')['cache-control'], 'no-cache');
    // The config is the kill switch, so a browser that is not behind the worker must revalidate it too.
    assert.equal(headersFor(headers, '/devocionales/js/devotional-pwa-config.js')['cache-control'], 'no-cache');
    assert.equal(headersFor(headers, MANIFEST_PATH)['content-type'], 'application/manifest+json');
    assert.equal(headersFor(headers, '/devocionales/manifests/*')['content-type'], 'application/manifest+json');
});

test('the existing assetlinks.json header block is untouched', () => {
    const block = headersFor(read('_headers'), '/.well-known/assetlinks.json');
    assert.equal(block['content-type'], 'application/json');
    assert.equal(block['cache-control'], 'no-cache');
});

test('headersFor: an unlisted path has no headers, and a wrong size is caught', () => {
    assert.deepEqual(headersFor('/a\n  X-One: 1\n', '/b'), {});
    assert.deepEqual(headersFor('/a\n  X-One: 1\n  Y: a:b\n', '/a'), { 'x-one': '1', y: 'a:b' });
    assert.notEqual(pngSize(path.join(ROOT, 'devocionales/icons/icon-192.png')), '512x512');
});

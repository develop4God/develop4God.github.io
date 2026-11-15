'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { buildSw, collectPrecache, computeVersion, renderSw, PLACEHOLDER } = require('./build-sw.js');

const TEMPLATE = `const CONFIG = JSON.parse('${PLACEHOLDER}');\n`;

const INDEX_HTML = `<!DOCTYPE html><html><head>
<link rel="manifest" href="/devocionales/manifest.webmanifest">
<link rel="preload" href="/devocionales/vendor/fonts/a.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/devocionales/vendor/tailwind.css">
<link rel="apple-touch-icon" href="/devocionales/icons/touch.png">
<script async src="https://www.googletagmanager.com/gtag/js?id=X"></script>
<script src="//cdn.example.com/x.js"></script>
<script src="/devocionales/js/devotional-pwa-config.js"></script>
<script src="/js/shared.js"></script>
</head><body></body></html>`;

function makeSite() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-sw-test-'));
    const write = (relative, content) => {
        fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
        fs.writeFileSync(path.join(root, relative), content);
    };
    write('devocionales/index.html', INDEX_HTML);
    write('devocionales/manifest.webmanifest', JSON.stringify({
        icons: [{ src: '/devocionales/icons/icon-192.png' }, { src: '/devocionales/icons/icon-512.png' }],
    }));
    write('devocionales/vendor/tailwind.css',
        "@font-face{src:url(fonts/a.woff2)}@font-face{src:url('fonts/b.woff2')}.x{background:url(data:image/png;base64,AAAA)}.y{background:url(https://example.com/i.png)}");
    for (const font of ['a', 'b']) write(`devocionales/vendor/fonts/${font}.woff2`, `font-${font}`);
    for (const icon of ['touch', 'icon-192', 'icon-512']) write(`devocionales/icons/${icon}.png`, `icon-${icon}`);
    write('js/shared.js', 'shared();');
    write('devocionales/js/devotional-pwa-config.js', 'window.DevotionalPwaConfig = {};');
    write('lang/devocionales/en.json', '{"a":1}');
    write('lang/devocionales/es.json', '{"a":2}');
    write('scripts/sw.template.js', TEMPLATE);
    return { root, write };
}

test('collectPrecache lists the shell, page assets, css fonts, manifest icons and every language file', () => {
    const { root } = makeSite();
    assert.deepEqual(collectPrecache(root), [
        '/devocionales/',
        '/devocionales/icons/icon-192.png',
        '/devocionales/icons/icon-512.png',
        '/devocionales/icons/touch.png',
        '/devocionales/js/devotional-pwa-config.js',
        '/devocionales/manifest.webmanifest',
        '/devocionales/vendor/fonts/a.woff2',
        '/devocionales/vendor/fonts/b.woff2',
        '/devocionales/vendor/tailwind.css',
        '/js/shared.js',
        '/lang/devocionales/en.json',
        '/lang/devocionales/es.json',
    ]);
});

test('collectPrecache skips external, protocol-relative and data: URLs', () => {
    const { root } = makeSite();
    const urls = collectPrecache(root);
    assert.equal(urls.some((url) => /googletagmanager|cdn\.example|example\.com|^data:/.test(url)), false);
});

test('collectPrecache fails loudly, naming a referenced file that does not exist', () => {
    const { root } = makeSite();
    fs.rmSync(path.join(root, 'js/shared.js'));
    assert.throws(() => collectPrecache(root), /js\/shared\.js/);
});

test('collectPrecache fails when a css font reference is missing', () => {
    const { root } = makeSite();
    fs.rmSync(path.join(root, 'devocionales/vendor/fonts/b.woff2'));
    assert.throws(() => collectPrecache(root), /fonts\/b\.woff2/);
});

test('collectPrecache ignores tags that are commented out of the page', () => {
    const { root, write } = makeSite();
    write('devocionales/index.html', INDEX_HTML.replace('</head>',
        '<!-- <script src="/js/gone.js"></script> <link rel="stylesheet" href="/gone.css"> --></head>'));
    const urls = collectPrecache(root);
    assert.equal(urls.some((url) => /gone/.test(url)), false);
});

test('collectPrecache reads single-quoted attributes and multi-word rel values', () => {
    const { root, write } = makeSite();
    write('js/single.js', 'single();');
    write('devocionales/icons/fav.png', 'fav');
    write('devocionales/index.html', INDEX_HTML.replace('</head>',
        "<script src='/js/single.js'></script><link rel=\"shortcut icon\" href=\"/devocionales/icons/fav.png\"></head>"));
    const urls = collectPrecache(root);
    assert.ok(urls.includes('/js/single.js'));
    assert.ok(urls.includes('/devocionales/icons/fav.png'));
});

test('collectPrecache ignores url() references inside css comments', () => {
    const { root, write } = makeSite();
    write('devocionales/vendor/tailwind.css',
        "@font-face{src:url(fonts/a.woff2)}/* old: url(fonts/ghost.woff2) */@font-face{src:url(fonts/b.woff2)}");
    const urls = collectPrecache(root);
    assert.equal(urls.some((url) => /ghost/.test(url)), false);
    assert.ok(urls.includes('/devocionales/vendor/fonts/b.woff2'));
});

test('collectPrecache also covers the other pages in devocionales/ and everything they load', () => {
    const { root, write } = makeSite();
    write('devocionales/privacy-policy.html', '<html><head><script src="/js/legal-only.js"></script></head></html>');
    write('js/legal-only.js', 'legal();');
    const urls = collectPrecache(root);
    assert.ok(urls.includes('/devocionales/privacy-policy.html'));
    assert.ok(urls.includes('/js/legal-only.js'));
});

test('collectPrecache fails when another page references a file that does not exist', () => {
    const { root, write } = makeSite();
    write('devocionales/terms.html', '<html><head><script src="/js/legal-missing.js"></script></head></html>');
    assert.throws(() => collectPrecache(root), /legal-missing\.js/);
});

test('collectPrecache covers same-origin images and url() references inside inline styles', () => {
    const { root, write } = makeSite();
    write('devocionales/icons/pic.png', 'pic');
    write('devocionales/icons/bg.png', 'bg');
    write('devocionales/index.html', INDEX_HTML
        .replace('<body>', '<body><img src="/devocionales/icons/pic.png" alt="">')
        .replace('</head>', '<style>.x{background:url(/devocionales/icons/bg.png)}</style></head>'));
    const urls = collectPrecache(root);
    assert.ok(urls.includes('/devocionales/icons/pic.png'));
    assert.ok(urls.includes('/devocionales/icons/bg.png'));
});

test('collectPrecache resolves a relative url() in an inline style against the page', () => {
    const { root, write } = makeSite();
    write('devocionales/icons/bg.png', 'bg');
    write('devocionales/index.html', INDEX_HTML.replace('</head>', '<style>.x{background:url(icons/bg.png)}</style></head>'));
    assert.ok(collectPrecache(root).includes('/devocionales/icons/bg.png'));
});

test('collectPrecache ignores an <img> with an empty or external src (the reader sets its image later)', () => {
    const { root, write } = makeSite();
    write('devocionales/index.html', INDEX_HTML.replace('<body>', '<body><img src="" alt=""><img src="https://example.com/a.png" alt="">'));
    assert.doesNotThrow(() => collectPrecache(root));
});

test('collectPrecache fails when an image or an inline-style url() points at a missing file', () => {
    const { root, write } = makeSite();
    write('devocionales/index.html', INDEX_HTML.replace('<body>', '<body><img src="/devocionales/icons/missing-pic.png" alt="">'));
    assert.throws(() => collectPrecache(root), /missing-pic\.png/);
    write('devocionales/index.html', INDEX_HTML.replace('</head>', '<style>.x{background:url(/devocionales/icons/missing-bg.png)}</style></head>'));
    assert.throws(() => collectPrecache(root), /missing-bg\.png/);
});

test('the config fetch wait is shorter than the data wait, because the page blocks on it', () => {
    const { config } = buildSw(makeSite().root);
    assert.ok(config.freshTimeoutMs > 0 && config.freshTimeoutMs < config.timeoutMs);
});

test('buildSw lists the extra pages for the worker, and none when there are none', () => {
    const { root, write } = makeSite();
    assert.deepEqual(buildSw(root).config.pages, []);
    write('devocionales/privacy-policy.html', '<html></html>');
    write('devocionales/terms.html', '<html></html>');
    assert.deepEqual(buildSw(root).config.pages, ['/devocionales/privacy-policy.html', '/devocionales/terms.html']);
});

test('buildSw rejects a fresh-first path that is not precached', () => {
    const { root } = makeSite();
    assert.throws(() => buildSw(root, { freshFirst: ['/devocionales/js/not-precached.js'] }), /not-precached\.js/);
});

test('buildSw is deterministic: the same site gives byte-identical output', () => {
    const { root } = makeSite();
    assert.equal(buildSw(root).source, buildSw(root).source);
});

test('the version changes when a precached file changes, and only then', () => {
    const { root, write } = makeSite();
    const before = buildSw(root).config.version;
    assert.match(before, /^[0-9a-f]{12}$/);
    assert.equal(buildSw(root).config.version, before);
    write('js/shared.js', 'shared(); // edited');
    assert.notEqual(buildSw(root).config.version, before);
});

test('the version changes when the worker template changes', () => {
    const { root, write } = makeSite();
    const before = buildSw(root).config.version;
    write('scripts/sw.template.js', `${TEMPLATE}// edited\n`);
    assert.notEqual(buildSw(root).config.version, before);
});

test('the version changes when the runtime configuration changes', () => {
    const { root } = makeSite();
    const urls = collectPrecache(root);
    const template = fs.readFileSync(path.join(root, 'scripts/sw.template.js'), 'utf8');
    const a = computeVersion(root, urls, template, { timeoutMs: 1 });
    assert.equal(computeVersion(root, urls, template, { timeoutMs: 1 }), a);
    assert.notEqual(computeVersion(root, urls, template, { timeoutMs: 2 }), a);
});

test('the version changes when the shell html changes', () => {
    const { root, write } = makeSite();
    const before = buildSw(root).config.version;
    write('devocionales/index.html', `${INDEX_HTML}\n<!-- edited -->`);
    assert.notEqual(buildSw(root).config.version, before);
});

test('the generated worker is valid JavaScript whose config carries the precache and version', () => {
    const { root } = makeSite();
    const { source, config } = buildSw(root);
    const sandbox = {};
    vm.runInNewContext(`${source}\nthis.CONFIG = CONFIG;`, sandbox);
    // Compared as JSON: objects built inside a vm context have another realm's prototypes.
    assert.equal(JSON.stringify(sandbox.CONFIG), JSON.stringify(config));
    assert.equal(JSON.stringify(sandbox.CONFIG.precache), JSON.stringify(collectPrecache(root)));
});

test('renderSw rejects a template without the placeholder', () => {
    assert.throws(() => renderSw('const CONFIG = {};', { version: 'x' }), /placeholder/i);
});

test('renderSw survives quotes and backslashes in the config', () => {
    const source = renderSw(TEMPLATE, { version: 'x', note: "it's a \\ test" });
    const sandbox = {};
    vm.runInNewContext(`${source}\nthis.CONFIG = CONFIG;`, sandbox);
    assert.equal(sandbox.CONFIG.note, "it's a \\ test");
});

test('the real site builds, and the worker never lists itself', () => {
    const root = path.join(__dirname, '..');
    const { config } = buildSw(root);
    assert.ok(config.precache.includes('/devocionales/'));
    assert.ok(config.precache.includes('/devocionales/vendor/tailwind.css'));
    assert.ok(config.precache.includes('/devocionales/vendor/fonts/inter-latin.woff2'));
    assert.equal(config.precache.filter((url) => url.endsWith('/sw.js')).length, 0);
    assert.deepEqual(config.pages, ['/devocionales/privacy-policy.html', '/devocionales/terms-and-conditions.html']);
    assert.ok(config.freshFirst.length > 0);
    for (const path of config.freshFirst) assert.ok(config.precache.includes(path), `${path} must be precached`);
    for (const path of config.sameOriginData) assert.equal(config.precache.includes(path), false, `${path} is fetched live`);
    assert.equal(config.precache.filter((url) => url.startsWith('/lang/devocionales/')).length, 10);
});

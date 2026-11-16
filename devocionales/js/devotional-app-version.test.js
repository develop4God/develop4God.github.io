const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Loads the script against a fake window and document, the way the page does.
function load({ config, element, build, buildElement = null }) {
    const filename = path.join(__dirname, 'devotional-app-version.js');
    const source = fs.readFileSync(filename, 'utf8');
    const elements = { '[data-app-version]': element, '[data-app-build]': buildElement };
    const doc = { querySelector: (selector) => elements[selector] || null };
    const win = { DevotionalPwaConfig: config, DevotionalBuild: build, document: doc };
    vm.runInThisContext(`(function(window, document){${source}\n})`, { filename })(win, doc);
    return win.DevotionalAppVersion;
}

test('shows the configured version in the version element', () => {
    const element = { textContent: '' };
    load({ config: { appVersion: '1.0.1+1' }, element });
    assert.equal(element.textContent, '1.0.1+1');
});

test('render returns true when it wrote the version', () => {
    const element = { textContent: '' };
    const api = load({ config: { appVersion: '2.3.4+7' }, element });
    assert.equal(api.render(), true);
});

test('without a config the element stays empty and nothing throws', () => {
    const element = { textContent: '' };
    const api = load({ config: undefined, element });
    assert.equal(element.textContent, '');
    assert.equal(api.render(), false);
});

test('an empty or non-string version is ignored', () => {
    for (const appVersion of ['', undefined, null, 101]) {
        const element = { textContent: '' };
        load({ config: { appVersion }, element });
        assert.equal(element.textContent, '', `version ${String(appVersion)}`);
    }
});

test('a page without the version element (an older page) does nothing and does not throw', () => {
    const api = load({ config: { appVersion: '1.0.1+1' }, element: null });
    assert.equal(api.render(), false);
});

test('the shipped config carries a version in the "x.y.z+n" form', () => {
    const source = fs.readFileSync(path.join(__dirname, 'devotional-pwa-config.js'), 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`)(win);
    assert.match(win.DevotionalPwaConfig.appVersion, /^\d+\.\d+\.\d+\+\d+$/);
});

test('shows the build id beside the version when both exist', () => {
    const element = { textContent: '' };
    const buildElement = { textContent: '' };
    load({ config: { appVersion: '1.0.1+1' }, element, build: { id: 'dd807300a4b6' }, buildElement });
    assert.equal(element.textContent, '1.0.1+1');
    assert.equal(buildElement.textContent, 'dd807300a4b6');
});

test('without a build stamp the version still shows and the build element stays empty', () => {
    const element = { textContent: '' };
    const buildElement = { textContent: '' };
    load({ config: { appVersion: '1.0.1+1' }, element, build: undefined, buildElement });
    assert.equal(element.textContent, '1.0.1+1');
    assert.equal(buildElement.textContent, '');
});

test('a page without the build element still shows the version and does not throw', () => {
    const element = { textContent: '' };
    load({ config: { appVersion: '1.0.1+1' }, element, build: { id: 'dd807300a4b6' }, buildElement: null });
    assert.equal(element.textContent, '1.0.1+1');
});

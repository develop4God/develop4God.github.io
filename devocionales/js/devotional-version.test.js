'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument, FakeElement } = require('./fake-dom.helper');

// Version codes come from the remote index.json: make any innerHTML write fail loudly.
Object.defineProperty(FakeElement.prototype, 'innerHTML', {
    configurable: true,
    set() { throw new Error('innerHTML must not be used with remote content'); },
});

const PAYLOAD = '"><img src=x onerror=alert(1)>';

// Runs a real browser-IIFE module against global.window.
function load(file) {
    const filename = path.join(__dirname, file);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}

function setup() {
    const doc = new FakeDocument();
    const byId = {};
    ['version-select', 'version-info-btn', 'version-info-popover'].forEach((id) => {
        const el = doc.createElement(id === 'version-select' ? 'select' : 'div');
        el.id = id;
        byId[id] = el;
    });
    byId['version-info-popover'].classList.add('hidden');
    global.document = {
        getElementById: (id) => byId[id] || null,
        createElement: (t) => doc.createElement(t),
        addEventListener() {},
    };
    global.window = {};
    global.localStorage = { getItem: () => null, setItem() {} };
    load('devotional-version.js');
    return { version: global.window.DevotionalVersion, byId };
}

const wiring = (versions, current) => ({
    getLanguage: () => 'en',
    getVersion: () => current,
    setVersion: () => {},
    availableVersions: async () => versions,
    onVersionChange: () => {},
});

test('setupVersionSelect: one option per version, value and label both the version code', async () => {
    const { version, byId } = setup();
    await version.setupVersionSelect(wiring(['KJV', 'NIV'], 'NIV'));
    const options = byId['version-select'].querySelectorAll('option');
    assert.deepEqual(options.map((o) => o.value), ['KJV', 'NIV']);
    assert.deepEqual(options.map((o) => o.textContent), ['KJV', 'NIV']);
    assert.equal(byId['version-select'].value, 'NIV');
});

test('setupVersionSelect: a markup payload as a version code stays text and creates no elements', async () => {
    const { version, byId } = setup();
    await version.setupVersionSelect(wiring([PAYLOAD], PAYLOAD));
    const select = byId['version-select'];
    assert.equal(select.all().some((e) => e.tagName === 'IMG'), false);
    const [option] = select.querySelectorAll('option');
    assert.equal(option.value, PAYLOAD);
    assert.equal(option.textContent, PAYLOAD);
});

test('setupVersionSelect: re-running replaces the previous options; an empty list leaves none', async () => {
    const { version, byId } = setup();
    await version.setupVersionSelect(wiring(['KJV', 'NIV'], 'KJV'));
    await version.setupVersionSelect(wiring(['KJV'], 'KJV'));
    assert.equal(byId['version-select'].querySelectorAll('option').length, 1);
    await version.setupVersionSelect(wiring([], ''));
    assert.equal(byId['version-select'].querySelectorAll('option').length, 0);
});

test('updateVersionInfoPopover: shows the full name for a known version and the bare code otherwise', () => {
    const { version, byId } = setup();
    version.updateVersionInfoPopover('en', 'KJV');
    assert.equal(byId['version-info-popover'].textContent, 'King James Version (KJV)');
    version.updateVersionInfoPopover('en', PAYLOAD);
    assert.equal(byId['version-info-popover'].textContent, PAYLOAD);
});

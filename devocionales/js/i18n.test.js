'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// i18n.js is a browser class file that, on load, registers
// DOMContentLoaded listeners (constructing I18n and calling init(),
// which touches fetch/localStorage/window.location). Stub a minimal
// browser-like environment so the module loads without throwing, then
// instantiate I18n directly and test renderLegalPrivacy()/renderLegalTerms()
// in isolation, with a fake #legal-*-content element that records the
// HTML written to it.
function makeFakeContainer() {
    return { innerHTML: '' };
}

function loadI18nSandbox() {
    const fakeDocument = {
        addEventListener() {},
        getElementById() { return null; },
        querySelectorAll() { return []; },
        querySelector() { return null; },
    };
    const sandbox = {
        document: fakeDocument,
        window: { location: { pathname: '/', search: '' } },
        console,
    };
    vm.createContext(sandbox);
    const filename = path.join(__dirname, 'i18n.js');
    const source = fs.readFileSync(filename, 'utf8');
    // Expose the class on the sandbox's global scope by appending an
    // assignment — the file only declares `class I18n {...}` at top level.
    vm.runInContext(`${source}\nthis.__I18nClass = I18n;`, sandbox, { filename });
    return sandbox;
}

// The class's methods close over the sandbox's own `document` binding
// (captured when the class body was evaluated in that vm context), not
// Node's global `document` — so container lookups must be stubbed on
// the sandbox's document, not on `global.document`.
function makeInstance(translations, containers) {
    const sandbox = loadI18nSandbox();
    const instance = new sandbox.__I18nClass();
    instance.translations = translations;
    sandbox.document.getElementById = (id) => containers[id] || null;
    return instance;
}

test('renderLegalPrivacy: renders section 1 list items (title+text+purpose) correctly', () => {
    const container = makeFakeContainer();
    const instance = makeInstance({
        legal: {
            privacy: {
                section1_title: 'Section 1',
                section1_text: 'Intro text',
                section1_list1_title: 'Identifiers:',
                section1_list1_text: 'We collect device identifiers.',
                section1_list1_purpose: 'Purpose:',
                section1_list1_purpose_text: 'For notifications.',
            },
        },
    }, { 'legal-privacy-content': container });

    instance.renderLegalPrivacy();

    assert.match(container.innerHTML, /<li><strong>Identifiers:<\/strong> We collect device identifiers\.<ul><li><strong>Purpose:<\/strong> For notifications\.<\/li><\/ul><\/li>/);
});

test('renderLegalPrivacy: renders section 2-7 list items given as flat strings (e.g. section4_list1)', () => {
    const container = makeFakeContainer();
    const instance = makeInstance({
        legal: {
            privacy: {
                section4_title: 'Third-Party Services',
                section4_text: 'We use these services:',
                section4_list1: 'Firebase (Google): for authentication.',
            },
        },
    }, { 'legal-privacy-content': container });

    instance.renderLegalPrivacy();

    assert.match(container.innerHTML, /<li>Firebase \(Google\): for authentication\.<\/li>/);
});

test('renderLegalPrivacy: renders section 2-7 list items given as title+text pairs (regression — these were silently dropped)', () => {
    // This is the exact shape lang/devocionales/*.json's section2 uses:
    // section2_list1_title / section2_list1_text, not a flat section2_list1
    // string. Before the fix, renderLegalPrivacy()'s generic loop for
    // sections 2-7 only checked `privacy[section${s}_list${i}]` (the flat
    // form) and silently produced an empty list for this shape, so these
    // three items never appeared on the rendered page in any language.
    const container = makeFakeContainer();
    const instance = makeInstance({
        legal: {
            privacy: {
                section2_title: 'How the Application Works and Local Data Handling',
                section2_text: 'Some functionalities operate locally on your device:',
                section2_list1_title: 'Reading Devotionals:',
                section2_list1_text: 'Devotional content loads for viewing.',
                section2_list2_title: 'Saving Favorites:',
                section2_list2_text: 'Saving favorites happens locally on your device.',
                section2_list3_title: 'Sharing with Contacts:',
                section2_list3_text: 'We do not store recipient info when you share.',
            },
        },
    }, { 'legal-privacy-content': container });

    instance.renderLegalPrivacy();

    assert.match(container.innerHTML, /<h2>How the Application Works and Local Data Handling<\/h2>/);
    assert.match(container.innerHTML, /<p>Some functionalities operate locally on your device:<\/p>/);
    assert.match(container.innerHTML, /<li><strong>Reading Devotionals:<\/strong> Devotional content loads for viewing\.<\/li>/);
    assert.match(container.innerHTML, /<li><strong>Saving Favorites:<\/strong> Saving favorites happens locally on your device\.<\/li>/);
    assert.match(container.innerHTML, /<li><strong>Sharing with Contacts:<\/strong> We do not store recipient info when you share\.<\/li>/);

    const listItemCount = (container.innerHTML.match(/<li>/g) || []).length;
    assert.equal(listItemCount, 3, 'all three section2 list items must render, not be silently dropped');
});

test('renderLegalPrivacy: shows an error message when translations.legal.privacy is missing', () => {
    const container = makeFakeContainer();
    const instance = makeInstance({}, { 'legal-privacy-content': container });

    instance.renderLegalPrivacy();

    assert.match(container.innerHTML, /\[Error\]/);
});

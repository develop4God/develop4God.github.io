'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// devotional-tts.js is a browser IIFE that reads DevotionalI18n and
// BibleTextFormatter off `window`. Load the REAL source of both — not
// hand-written fakes — plus real per-language translation JSON, so
// buildTtsText is exercised against the actual seam contract and actual
// copy, the same way it runs in the browser.
global.window = global.window || {};

function loadBrowserModule(moduleFilename) {
    const filename = path.join(__dirname, moduleFilename);
    const source = fs.readFileSync(filename, 'utf8');
    // vm.runInThisContext (not new Function) so c8/V8 can attribute coverage
    // back to this real filename instead of an anonymous eval.
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
}

loadBrowserModule('bible-text-formatter.js');

const enTranslations = JSON.parse(fs.readFileSync(path.join(__dirname, '../../lang/devocionales/en.json'), 'utf8'));
const esTranslations = JSON.parse(fs.readFileSync(path.join(__dirname, '../../lang/devocionales/es.json'), 'utf8'));

// Real i18n.t() contract: dot-path lookup into `this.translations`, raw key
// returned on a miss. DevotionalI18n.t() then swaps that miss for `fallback`.
global.window.i18n = {
    translations: enTranslations,
    currentLang: 'en',
    t(key) {
        return key.split('.').reduce((obj, k) => obj?.[k], this.translations) ?? key;
    },
};
loadBrowserModule('devotional-i18n-adapter.js');
loadBrowserModule('devotional-tts.js');

// devotional-tts.js references DevotionalI18n/BibleTextFormatter as bare
// identifiers (as it does in a real <script> tag, where they're globals);
// the modules above only attached them to `window`, so mirror that here.
global.DevotionalI18n = global.window.DevotionalI18n;
global.BibleTextFormatter = global.window.BibleTextFormatter;

const { buildTtsText } = global.window.DevotionalTts;

function setLang(translations) {
    global.window.i18n.translations = translations;
}

test('buildTtsText: assembles eyebrow/verse, reflexion, and oracion with real English copy', () => {
    setLang(enTranslations);
    const entry = {
        versiculo: '1 John 2:3',
        reflexion: 'Trust in the process.',
        oracion: 'Lord, guide us.',
        para_meditar: [],
        version: 'NIV',
    };

    const text = buildTtsText(entry, 'en');

    assert.match(text, /^Daily Devotional: First John chapter 2 verse 3/);
    assert.match(text, /Reflection: Trust in the process\./);
    assert.match(text, /Prayer: Lord, guide us\.$/);
});

test('buildTtsText: assembles real Spanish copy with Spanish book-ordinal expansion', () => {
    setLang(esTranslations);
    const entry = {
        versiculo: '1 Juan 2:3',
        reflexion: 'Confía en el proceso.',
        oracion: 'Señor, guíanos.',
        para_meditar: [],
        version: 'RVR1960',
    };

    const text = buildTtsText(entry, 'es');

    assert.match(text, /^Devocional Diario: Primera de Juan capítulo 2 versículo 3/);
    assert.match(text, /Reflexión: Confía en el proceso\./);
    assert.match(text, /Oración: Señor, guíanos\.$/);
});

test('buildTtsText: includes a "para meditar" section, with each citation expanded, when entries exist', () => {
    setLang(enTranslations);
    const entry = {
        versiculo: 'Psalm 23:1',
        reflexion: 'r',
        oracion: 'o',
        para_meditar: [
            { cita: '1 Peter 5:7', texto: 'Cast your anxiety on him.' },
            { cita: 'Psalm 46:1', texto: 'God is our refuge.' },
        ],
        version: 'NIV',
    };

    const text = buildTtsText(entry, 'en');

    assert.match(text, /To Meditate On: First Peter chapter 5 verse 7: Cast your anxiety on him\.\nPsalm chapter 46 verse 1: God is our refuge\./);
});

test('buildTtsText: omits the "para meditar" section entirely when there are no entries', () => {
    setLang(enTranslations);
    const entry = { versiculo: 'John 3:16', reflexion: 'r', oracion: 'o', para_meditar: [], version: 'NIV' };

    const text = buildTtsText(entry, 'en');

    assert.doesNotMatch(text, /To Meditate On/);
    const lines = text.split('\n');
    assert.equal(lines.length, 3); // eyebrow/verse, reflexion, oracion — no meditar line
});

test('buildTtsText: missing reflexion/oracion text degrades to an empty value, not a crash', () => {
    setLang(enTranslations);
    const entry = { versiculo: 'John 3:16', reflexion: undefined, oracion: undefined, para_meditar: [], version: 'NIV' };

    const text = buildTtsText(entry, 'en');

    assert.match(text, /Reflection: $/m);
    assert.match(text, /Prayer: $/);
});

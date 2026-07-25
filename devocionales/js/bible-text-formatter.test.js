'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// bible-text-formatter.js is a browser IIFE that attaches to `window`.
// Node has no `window`; supply a plain object as the attachment target.
global.window = global.window || {};
const filename = path.join(__dirname, 'bible-text-formatter.js');
const source = fs.readFileSync(filename, 'utf8');
// vm.runInThisContext (not new Function) so c8/V8 can attribute coverage
// back to this real filename instead of an anonymous eval.
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { formatBibleBook, formatBibleReferences, normalizeTtsText, getBibleVersionExpansions } = global.window.BibleTextFormatter;

test('formatBibleBook: book-ordinal formatting per language', () => {
    assert.equal(formatBibleBook('1 Juan 2:3', 'es'), 'Primera de Juan 2:3');
    assert.equal(formatBibleBook('2 Corintios 5:6', 'es'), 'Segunda de Corintios 5:6');
    assert.equal(formatBibleBook('3 Juan 1:1', 'es'), 'Tercera de Juan 1:1');

    assert.equal(formatBibleBook('1 John 2:3', 'en'), 'First John 2:3');
    assert.equal(formatBibleBook('2 Peter 1:1', 'en'), 'Second Peter 1:1');

    assert.equal(formatBibleBook('1 Joao 2:3', 'pt'), 'Primeiro Joao 2:3');
    assert.equal(formatBibleBook('1 Jean 2:3', 'fr'), 'Premier Jean 2:3');
    assert.equal(formatBibleBook('1 Petrus 2:3', 'de'), 'Erster Petrus 2:3');
    assert.equal(formatBibleBook('1 Corinto 2:3', 'fil'), 'Una Corinto 2:3');

    assert.equal(formatBibleBook('1 यूहन्ना 2:3', 'hi'), 'पहला यूहन्ना 2:3');
    assert.equal(formatBibleBook('1 يوحنا 2:3', 'ar'), 'الأول يوحنا 2:3');
});

test('formatBibleBook: Japanese and Chinese pass through unchanged (no ordinals)', () => {
    assert.equal(formatBibleBook('  ヨハネ 2:3  ', 'ja'), 'ヨハネ 2:3');
    assert.equal(formatBibleBook('  约翰福音 2:3  ', 'zh'), '约翰福音 2:3');
});

test('formatBibleReferences: chapter:verse phrasing per language', () => {
    assert.equal(formatBibleReferences('Juan 3:16', 'es'), 'Juan capítulo 3 versículo 16');
    assert.equal(formatBibleReferences('John 3:16', 'en'), 'John chapter 3 verse 16');
    assert.equal(formatBibleReferences('Joao 3:16', 'pt'), 'Joao capítulo 3 versículo 16');
    assert.equal(formatBibleReferences('Jean 3:16', 'fr'), 'Jean chapitre 3 verset 16');
    assert.equal(formatBibleReferences('Johannes 3:16', 'de'), 'Johannes Kapitel 3 Vers 16');
    assert.equal(formatBibleReferences('Corinto 3:16', 'fil'), 'Corinto kabanata 3 talata 16');
});

test('formatBibleReferences: verse ranges append the "to" word', () => {
    assert.equal(formatBibleReferences('John 3:16-17', 'en'), 'John chapter 3 verse 16 to 17');
    assert.equal(formatBibleReferences('Juan 3:16-17', 'es'), 'Juan capítulo 3 versículo 16 al 17');
});

test('formatBibleReferences: CJK, Devanagari, and Arabic scripts', () => {
    assert.equal(formatBibleReferences('ヨハネ 3:16', 'ja'), 'ヨハネ 章 3 節 16');
    assert.equal(formatBibleReferences('约翰福音 3:16', 'zh'), '约翰福音 章 3 节 16');
    assert.equal(formatBibleReferences('यूहन्ना 3:16', 'hi'), 'यूहन्ना अध्याय 3 पद 16');
    assert.equal(formatBibleReferences('يوحنا 3:16', 'ar'), 'يوحنا الإصحاح 3 الآية 16');
});

test('getBibleVersionExpansions: falls back to es for unknown languages', () => {
    assert.deepEqual(getBibleVersionExpansions('xx'), getBibleVersionExpansions('es'));
});

test('normalizeTtsText: expands known Bible version codes per language', () => {
    assert.match(normalizeTtsText('RVR1960', 'es', 'RVR1960'), /Reina Valera mil novecientos sesenta/);
    assert.match(normalizeTtsText('NIV', 'en', 'NIV'), /New International Version/);
    assert.match(normalizeTtsText('LU17', 'de', 'LU17'), /Lutherbibel zweitausendsiebzehn/);
    assert.match(normalizeTtsText('MBB05', 'fil', 'MBB05'), /Magandang Balita Biblia/);
});

test('normalizeTtsText: fr expands Bible version codes (fixed — was previously missing entirely)', () => {
    // BIBLE_VERSION_EXPANSIONS.fr was missing until this fix; also added to
    // the Dart source's getBibleVersionExpansions('fr') to keep both in sync.
    assert.match(normalizeTtsText('LSG1910', 'fr', 'LSG1910'), /Louis Segond mille neuf cent dix/);
    assert.match(normalizeTtsText('TOB', 'fr', 'TOB'), /Traduction Oecuménique de la Bible/);
});

test('normalizeTtsText: hi long-form version string expands once, not double (fixed)', () => {
    // Two independent bugs compounded here, both now fixed:
    // 1. HindiTtsNormalizer.preProcess() ran a standalone expansion of
    //    'ओ.वी.' (in EXTRA_VERSION_KEYS) BEFORE the main version-expansion
    //    loop, turning 'पवित्र बाइबिल (ओ.वी.)' into 'पवित्र बाइबिल (पवित्र
    //    बाइबिल पुराना संस्करण)'. Verified against real content: every
    //    occurrence (730 total across both Devocionales-json hi/HIOV year
    //    files) of 'ओ.वी.' appears only inside the full phrase, never
    //    standalone — the shortcut was dead weight. Removed from
    //    EXTRA_VERSION_KEYS.
    // 2. Separately, BIBLE_VERSION_EXPANSIONS.hi's own keys overlap (the
    //    short key 'पवित्र बाइबिल' is a substring of the long key 'पवित्र
    //    बाइबिल (ओ.वी.)'; 'OV' is a substring of 'HIOV'). The expansion
    //    loop scanned keys in declaration order without stopping, so after
    //    the long key matched and expanded, the loop kept going and the
    //    short key matched *the expansion's own output*, double-expanding
    //    it. Fixed by sorting keys longest-first and stopping after the
    //    first match (safe for every language: normalizeTtsText is always
    //    called with one version per call — see devotional-loader.js's
    //    buildTtsText, which calls it per-field with a single entry.version
    //    — so only one key should ever match per call).
    const result = normalizeTtsText('पवित्र बाइबिल (ओ.वी.)', 'hi', 'HIOV');
    assert.equal(result, 'पवित्र बाइबिल पुराना संस्करण');
});

test('normalizeTtsText: Hindi Devanagari digit conversion runs before other normalization', () => {
    const result = normalizeTtsText('यूहन्ना ३:१६', 'hi', 'HIOV');
    assert.match(result, /3/);
    assert.match(result, /16/);
});

test('normalizeTtsText: sanitizes control characters and replacement chars', () => {
    const result = normalizeTtsText('Hello\x00World�', 'en', 'NIV');
    assert.equal(result, 'HelloWorld');
});

test('normalizeTtsText: collapses whitespace and trims', () => {
    const result = normalizeTtsText('  John   3:16   ', 'en', 'NIV');
    assert.equal(result, 'John chapter 3 verse 16');
});

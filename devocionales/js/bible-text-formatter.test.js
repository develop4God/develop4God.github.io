'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// bible-text-formatter.js is a browser IIFE that attaches to `window`.
// Node has no `window`; supply a plain object as the attachment target.
global.window = global.window || {};
const source = fs.readFileSync(
    path.join(__dirname, 'bible-text-formatter.js'),
    'utf8'
);
// eslint-disable-next-line no-new-func
new Function('window', source)(global.window);
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

test('normalizeTtsText: known bug — fr has no Bible version expansion table entry', () => {
    // BIBLE_VERSION_EXPANSIONS.fr does not exist, so the code falls back to
    // the `es` table and the LSG1910 code passes through unexpanded. See
    // "Known pre-existing bugs" in the SOLID i18n plan hand-off notes.
    const result = normalizeTtsText('LSG1910', 'fr', 'LSG1910');
    assert.equal(result, 'LSG1910');
});

test('normalizeTtsText: known bug — hi substring-collision double-expands one version string', () => {
    // 'पवित्र बाइबिल' is a substring of 'पवित्र बाइबिल (ओ.वी.)', and object key
    // iteration order expands the short key first, so the long-form input
    // gets nested/double-expanded. Ported faithfully from the Dart source
    // (bible_text_formatter.dart) — same bug exists there too. See
    // "Known pre-existing bugs" in the SOLID i18n plan hand-off notes.
    const result = normalizeTtsText('पवित्र बाइबिल (ओ.वी.)', 'hi', 'HIOV');
    assert.notEqual(result, 'पवित्र बाइबिल पुराना संस्करण');
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

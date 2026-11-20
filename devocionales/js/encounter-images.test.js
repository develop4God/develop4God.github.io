'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'encounter-images.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const { createImageUrls } = global.window.EncounterImages;

const urls = createImageUrls('https://cdn.test/images/encounters');

// Mirrors Constants.getEncounterImageUrl in devocional_nuevo.

test('builds {base}/{encounterId}/{name}.{format}', () => {
    assert.equal(urls.imageUrl('peter_water_001', 'peter_intro', 'avif'), 'https://cdn.test/images/encounters/peter_water_001/peter_intro.avif');
    assert.equal(urls.imageUrl('peter_water_001', 'peter_intro', 'png'), 'https://cdn.test/images/encounters/peter_water_001/peter_intro.png');
});

test('a filename that already has an extension is stripped and replaced by the format', () => {
    assert.equal(urls.imageUrl('a', 'peter_intro.jpg', 'avif'), 'https://cdn.test/images/encounters/a/peter_intro.avif');
    assert.equal(urls.imageUrl('a', 'x.y.png', 'png'), 'https://cdn.test/images/encounters/a/x.y.png');
});

test('defaults to webp', () => {
    assert.ok(urls.imageUrl('a', 'b').endsWith('/a/b.webp'));
});

test('a trailing slash on the base is tolerated', () => {
    assert.equal(createImageUrls('https://cdn.test/e/').imageUrl('a', 'b', 'png'), 'https://cdn.test/e/a/b.png');
});

test('unsafe or empty parts give an empty string, never a url that escapes the folder', () => {
    for (const [id, name] of [['../x', 'a'], ['a', '../b'], ['a/b', 'c'], ['a', 'b/c'], ['', 'b'], ['a', ''], [null, 'b'], ['a', undefined], ['a', 5], ['a\\b', 'c'], ['a', '..']]) {
        assert.equal(urls.imageUrl(id, name, 'png'), '', `${id} ${name}`);
    }
});

test('only known formats are accepted', () => {
    assert.equal(urls.imageUrl('a', 'b', 'exe'), '');
    assert.equal(urls.imageUrl('a', 'b', 'webp'), 'https://cdn.test/images/encounters/a/b.webp');
});

test('cardImageUrl(card, format) reads id and introImage from an index card', () => {
    assert.equal(urls.cardImageUrl({ id: 'a', introImage: 'peter_intro.png' }, 'avif'), 'https://cdn.test/images/encounters/a/peter_intro.avif');
    assert.equal(urls.cardImageUrl({ id: 'a', introImage: '' }, 'avif'), '');
    assert.equal(urls.cardImageUrl(null, 'avif'), '');
});

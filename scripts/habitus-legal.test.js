'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseTags } = require('./html-tags.js');

const ROOT = path.join(__dirname, '..');
const HOST = 'https://develop4god.com';
const LANGS = ['es', 'en', 'pt', 'fr', 'zh', 'ja', 'hi', 'de', 'ar', 'fil'];
const APP_NAME = 'Habitus+Faith';
// The product name as each language's Devocionales legal text writes it; the Habitus text must not carry it.
const OLD_NAMES = {
    es: 'Devocionales Cristianos',
    en: 'Christian Devotionals',
    pt: 'Devocionais Cristãos',
    fr: 'Méditations Chrétiennes',
    zh: '基督徒灵修',
    ja: 'クリスチャン・デボーション',
    hi: 'ईसाई भक्ति',
    de: 'Christliche Andachten',
    ar: 'تأملات مسيحية',
    fil: 'Mga Debosyonal na Kristiyano',
};
const PAGES = [
    { file: 'habitus/politica-de-privacidad.html', canonical: `${HOST}/habitus/politica-de-privacidad`, kind: 'privacy' },
    { file: 'habitus/terminos-y-condiciones.html', canonical: `${HOST}/habitus/terminos-y-condiciones`, kind: 'terms' },
];

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function leaves(obj, prefix = '') {
    return Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' && v !== null ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));
}

for (const page of PAGES) {
    test(`${page.file} exists and declares the extensionless apex canonical`, () => {
        const tags = parseTags(read(page.file));
        const canonicals = tags.filter((t) => t.name === 'link' && (t.attrs.rel || '').toLowerCase() === 'canonical');
        assert.equal(canonicals.length, 1);
        assert.equal(canonicals[0].attrs.href, page.canonical);
    });

    test(`${page.file} links back to /habitus/ and carries no Devocionales name or paths`, () => {
        const html = read(page.file);
        assert.match(html, /href="\/habitus\/"/);
        assert.doesNotMatch(html, /Devocionales Cristianos|Christian Devotionals|\/devocionales\/(?!css\/|vendor\/|js\/dom-builder)/);
        assert.ok(html.includes(APP_NAME));
    });

    test(`${page.file} is listed in sitemap.xml`, () => {
        assert.ok(read('sitemap.xml').includes(`<loc>${page.canonical}</loc>`));
    });
}

for (const lang of LANGS) {
    test(`lang/habitus/${lang}.json: legal text is the Devocionales text with only the name swapped`, () => {
        const habitus = readJson(`lang/habitus/${lang}.json`);
        const devocionales = readJson(`lang/devocionales/${lang}.json`);
        assert.ok(habitus.legal, 'legal block missing');
        const expected = leaves(devocionales.legal);
        assert.equal(leaves(habitus.legal).length, expected.length);
        for (const [key, value] of expected) {
            const swapped = value.split(OLD_NAMES[lang]).join(APP_NAME);
            const actual = key.split('.').reduce((o, k) => (o ? o[k] : undefined), habitus.legal);
            assert.equal(actual, swapped, `${lang} legal.${key}`);
        }
    });

    test(`lang/habitus/${lang}.json: no old product name left, new name present`, () => {
        const legal = JSON.stringify(readJson(`lang/habitus/${lang}.json`).legal);
        assert.ok(!legal.includes(OLD_NAMES[lang]));
        assert.ok(legal.includes(APP_NAME));
    });

    test(`lang/habitus/${lang}.json: footer has the privacy and terms link labels from Devocionales`, () => {
        const footer = readJson(`lang/habitus/${lang}.json`).footer;
        const source = readJson(`lang/devocionales/${lang}.json`).footer;
        assert.equal(footer.privacy, source.privacy);
        assert.equal(footer.terms, source.terms);
    });
}

test('habitus/index.html footer links to both legal pages by their extensionless URLs', () => {
    const tags = parseTags(read('habitus/index.html'));
    const hrefs = tags.filter((t) => t.name === 'a').map((t) => t.attrs.href);
    assert.ok(hrefs.includes('/habitus/politica-de-privacidad'));
    assert.ok(hrefs.includes('/habitus/terminos-y-condiciones'));
});

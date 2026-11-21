'use strict';

// "New" badge on the Bible-studies and Encounters tabs of the browser navigation.
// Markup-level checks: the badge is a translated span inside the tab link, and every page with
// those tabs links the shared badge stylesheet.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const BADGE = '<span class="nav-new-badge" data-i18n="shell.new_badge">New</span>';

const LOCALES = ['ar', 'de', 'en', 'es', 'fil', 'fr', 'hi', 'ja', 'pt', 'zh'];

test('every locale file defines a non-empty shell.new_badge label', () => {
    for (const locale of LOCALES) {
        const json = JSON.parse(read(`lang/devocionales/${locale}.json`));
        assert.equal(typeof json.shell.new_badge, 'string', `${locale} is missing shell.new_badge`);
        assert.notEqual(json.shell.new_badge.trim(), '', `${locale} has an empty shell.new_badge`);
    }
});

test('home page: badge sits inside the Bible-studies and Encounters tab links only', () => {
    const html = read('devocionales/index.html');
    const studies = html.match(/<a href="\/devocionales\/estudios\/"[^>]*id="nav-studies-label"[^>]*>[\s\S]*?<\/a>/)[0];
    const encounters = html.match(/<a href="\/devocionales\/encounters\/"[^>]*id="nav-encounters-label"[^>]*>[\s\S]*?<\/a>/)[0];
    const devotional = html.match(/<a href="\/devocionales\/"[^>]*id="nav-devotional-label"[^>]*>[\s\S]*?<\/a>/)[0];
    assert.ok(studies.includes(BADGE), 'Bible-studies tab has no badge');
    assert.ok(encounters.includes(BADGE), 'Encounters tab has no badge');
    assert.ok(!devotional.includes('nav-new-badge'), 'Today\'s Devotional tab must not get the badge');
});

test('studies page: badge on the Encounters tab, not on the Bible-studies tab', () => {
    const html = read('devocionales/estudios/index.html');
    const encounters = html.match(/<a href="\/devocionales\/encounters\/"[^>]*>[\s\S]*?<\/a>/)[0];
    const studies = html.match(/<a href="\/devocionales\/estudios\/"[^>]*>[\s\S]*?<\/a>/)[0];
    assert.ok(encounters.includes(BADGE), 'Encounters tab has no badge');
    assert.ok(!studies.includes('nav-new-badge'), 'Bible-studies tab must not get the badge');
});

test('encounters page: badge on the Bible-studies tab, not on the Encounters tab', () => {
    const html = read('devocionales/encounters/index.html');
    const studies = html.match(/<a href="\/devocionales\/estudios\/"[^>]*>[\s\S]*?<\/a>/)[0];
    const encounters = html.match(/<a href="\/devocionales\/encounters\/"[^>]*>[\s\S]*?<\/a>/)[0];
    assert.ok(studies.includes(BADGE), 'Bible-studies tab has no badge');
    assert.ok(!encounters.includes('nav-new-badge'), 'Encounters tab must not get the badge');
});

test('all three pages link shell.css, which carries the badge rule', () => {
    for (const page of ['devocionales/index.html', 'devocionales/estudios/index.html', 'devocionales/encounters/index.html']) {
        assert.ok(read(page).includes('href="/devocionales/pwa/shell.css"'), `${page} does not link shell.css`);
    }
    assert.match(read('devocionales/pwa/shell.css'), /\.nav-new-badge\s*\{/);
});

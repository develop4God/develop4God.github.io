'use strict';

// Settings markup that the unit tests of the scripts cannot see: the consent line, and the programmatic
// labels of the controls. The e2e specs check the same in a real browser; these fail faster.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'devocionales', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'devocionales', 'pwa', 'shell.css'), 'utf8');
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'lang', 'devocionales', 'en.json'), 'utf8'));

const pushSection = () => {
  const start = html.indexOf('<section data-push '); // not data-push-offer, the first-launch card above it
  assert.notEqual(start, -1);
  return html.slice(start, html.indexOf('</section>', start));
};

test('the push block carries the consent line (see the push doc), with the text of the language file', () => {
  const match = pushSection().match(/<p class="text-xs mb-2" data-i18n="push\.consent">([^<]*)<\/p>/);
  assert.ok(match, 'consent line missing from the push section');
  assert.equal(match[1], en.push.consent);
});

test('the hour select is named by the row label, not by the label text plus the time it shows', () => {
  const section = pushSection();
  assert.match(section, /<span class="settings-label" id="push-time-label"/);
  assert.match(section, /<select id="push-hour"[^>]*aria-labelledby="push-time-label"/);
});

test('every settings row has a label with an id for its control to point at', () => {
  for (const slot of ['language', 'theme', 'font']) {
    assert.match(html, new RegExp(`data-shell-slot="${slot}"><span class="settings-label" id="shell-${slot}-label"`));
  }
});

test('the theme switch has no hard-coded Spanish name: it is named by a translated label', () => {
  assert.doesNotMatch(html, /Cambiar tema/);
  assert.match(html, /<span id="theme-switch-label" class="sr-only" data-i18n="shell\.theme">/);
  // The checkbox itself is display:none, so the label is what is named.
  assert.match(html, /<label class="theme-switch" for="theme-toggle" aria-labelledby="theme-switch-label">/);
});

test('in the installed app the font toggle lives in Settings, so the Reading options eyebrow is hidden', () => {
  assert.match(css, /\.shell-active #reading-options-label\s*\{\s*display:\s*none;/);
});

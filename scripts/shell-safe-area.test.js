'use strict';

// The installed iPhone app draws the home indicator over the bottom of the screen. The bottom bar
// only gets the room it needs from env(safe-area-inset-bottom), and Safari reports 0 for that value
// unless the page opts in with viewport-fit=cover. Playwright cannot emulate a safe area, so these
// checks read the files; the real proof is the iPhone home-screen app (see the PR checklist).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'devocionales', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'devocionales', 'pwa', 'shell.css'), 'utf8');

const ruleBody = (source, selector) => {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `rule not found: ${selector}`);
  return source.slice(start, source.indexOf('}', start));
};

test('the viewport opts in to the full screen, so env(safe-area-inset-*) reports the real insets', () => {
  const viewport = html.match(/<meta name="viewport" content="([^"]*)"/);
  assert.ok(viewport, 'viewport meta not found');
  assert.match(viewport[1], /viewport-fit=cover/);
  assert.match(viewport[1], /width=device-width/);
});

test('the phone bottom bar lifts its tabs above the home indicator, and the page leaves room for the bar', () => {
  assert.match(ruleBody(css, '.shell-active[data-shell-layout="bar"] [data-shell-nav]'), /padding-bottom:\s*env\(safe-area-inset-bottom\)/);
  assert.match(ruleBody(css, '.shell-active[data-shell-layout="bar"] body'), /env\(safe-area-inset-bottom\)/);
});

test('with the full screen in use, content stays out of the landscape notch on every surface', () => {
  const body = ruleBody(html, 'body');
  assert.match(body, /padding-left:\s*env\(safe-area-inset-left\)/);
  assert.match(body, /padding-right:\s*env\(safe-area-inset-right\)/);
});

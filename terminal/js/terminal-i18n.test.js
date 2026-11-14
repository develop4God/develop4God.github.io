const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global.window || {};
function load(file) {
  const filename = path.join(__dirname, file);
  vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
load('terminal-i18n.js');
load('terminal-theme.js');
const I = global.window.TerminalI18n;
const T = global.window.TerminalTheme;
const LANG_DIR = path.join(__dirname, '..', '..', 'lang', 'terminal');

test('resolveLanguage prefers URL param, then saved, then browser, then English', () => {
  assert.strictEqual(I.resolveLanguage({ param: 'es', saved: 'en', browser: 'en' }), 'es');
  assert.strictEqual(I.resolveLanguage({ saved: 'es', browser: 'en' }), 'es');
  assert.strictEqual(I.resolveLanguage({ browser: 'es-MX' }), 'es');
  assert.strictEqual(I.resolveLanguage({}), 'en');
});

test('resolveLanguage ignores unsupported, empty and malformed values', () => {
  assert.strictEqual(I.resolveLanguage({ param: 'pt', saved: 'xx', browser: 'fr-FR' }), 'en');
  assert.strictEqual(I.resolveLanguage({ param: '', saved: null, browser: undefined }), 'en');
  assert.strictEqual(I.resolveLanguage({ param: 'ES' }), 'es');
  assert.strictEqual(I.resolveLanguage({ param: '__proto__' }), 'en');
});

test('get resolves nested keys, arrays, and returns undefined for missing paths', () => {
  const d = { a: { b: 'x', list: ['p', 'q'] } };
  assert.strictEqual(I.get(d, 'a.b'), 'x');
  assert.deepStrictEqual(I.get(d, 'a.list'), ['p', 'q']);
  assert.strictEqual(I.get(d, 'a.missing'), undefined);
  assert.strictEqual(I.get(d, 'z.y.x'), undefined);
  assert.strictEqual(I.get(null, 'a'), undefined);
  assert.strictEqual(I.get(d, 'a.b.c'), undefined);
});

function flatten(o, prefix, out) {
  Object.keys(o).forEach((k) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) flatten(o[k], key, out);
    else out[key] = o[k];
  });
  return out;
}

test('every supported language file parses and has exactly the same keys as English', () => {
  const en = flatten(JSON.parse(fs.readFileSync(path.join(LANG_DIR, 'en.json'), 'utf8')), '', {});
  I.SUPPORTED.forEach((lang) => {
    const d = flatten(JSON.parse(fs.readFileSync(path.join(LANG_DIR, `${lang}.json`), 'utf8')), '', {});
    assert.deepStrictEqual(Object.keys(d).sort(), Object.keys(en).sort(), lang);
    Object.keys(d).forEach((k) => {
      const v = d[k];
      assert.ok(Array.isArray(v) ? v.length > 0 && v.every((x) => String(x).trim()) : String(v).trim(), `${lang}:${k} empty`);
      if (Array.isArray(en[k])) assert.strictEqual(v.length, en[k].length, `${lang}:${k} length`);
    });
  });
});

test('hero verse is present with a reference and version in each language', () => {
  I.SUPPORTED.forEach((lang) => {
    const d = JSON.parse(fs.readFileSync(path.join(LANG_DIR, `${lang}.json`), 'utf8'));
    assert.ok(d.hero.verse.length > 20);
    assert.match(d.hero.ref, /3:23/);
    assert.ok(d.hero.version.length > 2);
  });
});

test('every data-i18n key used in the root index.html exists in every language file', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-aria|-content)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 20);
  I.SUPPORTED.forEach((lang) => {
    const d = JSON.parse(fs.readFileSync(path.join(LANG_DIR, `${lang}.json`), 'utf8'));
    keys.forEach((k) => assert.notStrictEqual(I.get(d, k), undefined, `${lang}: missing ${k}`));
  });
});

test('English fallback text in the root index.html matches en.json (no-JS and SEO safe)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const en = JSON.parse(fs.readFileSync(path.join(LANG_DIR, 'en.json'), 'utf8'));
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const found = [...html.matchAll(/<(\w+)[^>]*\sdata-i18n="([^"]+)"[^>]*>([^<]*)<\/\1>/g)];
  assert.ok(found.length > 40);
  found.forEach((m) => {
    const key = m[2];
    // A {token} in en.json is filled from app-stats.json at runtime, so the fallback may say anything there.
    const expected = I.get(en, key);
    const pattern = new RegExp('^' + expected.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '.+') + '$');
    assert.match(decode(m[3]), pattern, `fallback for ${key}`);
  });
});

let fetched = [];
function mockFetch(routes) {
  fetched = [];
  global.fetch = async (url) => {
    fetched.push(url);
    const body = routes[url];
    return { ok: body !== undefined, json: async () => body };
  };
}
const TERM = (l) => ({ meta: { title: l }, hero: { verse: `verse-${l}` } });

test('load returns the requested language from the terminal file only (no shared home footer)', async () => {
  mockFetch({ '/lang/terminal/es.json': TERM('es'), '/lang/home/es.json': { footer: { copyright: 'c-es' } } });
  const r = await I.load('es');
  assert.strictEqual(r.lang, 'es');
  assert.strictEqual(r.dict.hero.verse, 'verse-es');
  assert.strictEqual(r.dict.footer, undefined);
  assert.deepStrictEqual(fetched, ['/lang/terminal/es.json']);
});

test('load falls back to English and reports English when the page copy fails', async () => {
  mockFetch({ '/lang/terminal/en.json': TERM('en') });
  const r = await I.load('es');
  assert.strictEqual(r.lang, 'en');
  assert.strictEqual(r.dict.hero.verse, 'verse-en');
});

test('load resolves to an empty English dictionary when everything fails', async () => {
  mockFetch({});
  const r = await I.load('en');
  assert.deepStrictEqual(r, { lang: 'en', dict: {} });
});

test('resolveTheme honours saved light/dark, ignores junk, falls back to system preference', () => {
  assert.strictEqual(T.resolveTheme('light', true), 'light');
  assert.strictEqual(T.resolveTheme('dark', false), 'dark');
  assert.strictEqual(T.resolveTheme('purple', true), 'dark');
  assert.strictEqual(T.resolveTheme(null, false), 'light');
  assert.strictEqual(T.resolveTheme(undefined, true), 'dark');
});

test('nextTheme flips between light and dark', () => {
  assert.strictEqual(T.nextTheme('dark'), 'light');
  assert.strictEqual(T.nextTheme('light'), 'dark');
  assert.strictEqual(T.nextTheme('weird'), 'light');
});

test('interpolate fills known {tokens} and leaves unknown ones visible', () => {
  assert.strictEqual(I.interpolate('in {languages} languages', { languages: '10' }), 'in 10 languages');
  assert.strictEqual(I.interpolate('{a} and {b}', { a: 'x', b: 'y' }), 'x and y');
  assert.strictEqual(I.interpolate('{languages} idiomas', {}), '{languages} idiomas');
  assert.strictEqual(I.interpolate('no tokens', { languages: '10' }), 'no tokens');
  assert.strictEqual(I.interpolate('{languages}', { languages: '$&' }), '$&');
  assert.strictEqual(I.interpolate('{toString}', {}), '{toString}');
  assert.strictEqual(I.interpolate('{languages}'), '{languages}');
  assert.strictEqual(I.interpolate(undefined, { languages: '10' }), undefined);
});

function fakeRoot(entries) {
  const els = entries.map(([key, text]) => ({ text, getAttribute: () => key, set textContent(v) { this.text = v; }, get textContent() { return this.text; } }));
  return { els, querySelectorAll: (sel) => (sel === '[data-i18n]' ? els : []) };
}

test('apply fills {tokens} from stats and keeps the current text when a stat is missing', () => {
  global.document = { title: '', documentElement: { setAttribute() {} } };
  const dict = { a: { t: '{languages} languages' }, b: { t: 'ok' } };
  const withStats = fakeRoot([['a.t', 'several languages'], ['b.t', 'x']]);
  I.apply(withStats, dict, 'en', { languages: '10' });
  assert.deepStrictEqual(withStats.els.map((e) => e.text), ['10 languages', 'ok']);
  const withoutStats = fakeRoot([['a.t', 'several languages']]);
  I.apply(withoutStats, dict, 'en', {});
  assert.strictEqual(withoutStats.els[0].text, 'several languages');
});

test('no language count is written by hand in the terminal strings (it comes from app-stats.json)', () => {
  ['en', 'es'].forEach((lang) => {
    const raw = fs.readFileSync(path.join(LANG_DIR, `${lang}.json`), 'utf8');
    assert.doesNotMatch(raw, /\b(10|ten|diez)\s+(languages|idiomas)/i, `${lang}: hardcoded language count`);
  });
});

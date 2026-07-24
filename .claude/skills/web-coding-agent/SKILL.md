---
name: web-coding-agent
description: Day-to-day coding agent execution rules for develop4God.github.io (static HTML/CSS/JS, no bundler, no framework, GitHub Pages + Cloudflare Pages). Load this skill before making any code change, applying any delegation block, implementing any feature, or fixing any bug in this repo. Enforces mandatory quality gates (node --check, eslint, stylelint, html-validate, node --test), CDP-based headless-Chrome runtime verification, SOLID-lite discipline for a vanilla-JS site, and regression-test coverage on every fix. Use when the user says "apply this", "implement this", "make this change", "fix this bug", "add this feature", or hands you any delegation block targeting this repo.
---

# Web Coding Agent — Execution Rules

You are a coding agent executing tasks in `develop4God.github.io` — a static, multi-section site (root marketing hub, `/devocionales/` daily devotional reader, `/habitus/`) with **no build step, no bundler, no framework, no package.json**. Every `<script>` tag is a real, separately-loaded global-scope file. There is no compiler to catch a typo — verification is entirely your responsibility.

You do not design architecture. You do not decide between patterns unprompted. You apply what is given, stay in scope, and verify your own work before declaring done.

You do not skip verification because "it's just HTML/CSS/JS." This codebase has a documented history of exactly that assumption causing real breakage: two independently corrupted `i18n.js` files that silently blanked legal pages, went undetected for a full session each time.

---

## Project Identity

- **Repo:** `develop4God/develop4God.github.io`
- **Stack:** Vanilla HTML/CSS/JS, Tailwind via CDN `<script>`, Lucide icons via CDN. No npm install, no build step. Deploys directly to GitHub Pages / Cloudflare Pages from the repo as-is.
- **Sections, each with their own `css/`, `js/`, `lang/`:**
  - `/` (root) — marketing hub, uses `js/i18n.js` + `js/home.js`
  - `/devocionales/` — daily devotional reader (`devocionales/index.html`), uses `devocionales/js/i18n.js` + `devocionales/js/devotional-loader.js` + `devocionales/js/devotional-i18n-adapter.js`
  - `/devocionales/legacy.html` — former marketing hub, unlinked, kept for reference
  - `/habitus/` — separate mini-app, uses `habitus/js/habitus.js`
- **i18n:** 10 languages for devocionales (es/en/pt/fr/ja/zh/hi/de/ar/fil), 7 for root/habitus (es/en/pt/fr/zh/ja/hi). Default/fallback language is **English** (`en`), site-wide, as of 2026-07. Language preference persists across all three sections via a single shared `localStorage` key: `develop4God_language`.
- **Known architectural debt (do not silently "fix" — flag and ask):** two separate `i18n.js` files (root vs. `devocionales/`) with different embedded content and different language lists. They share a localStorage key now but are not otherwise consolidated. Do not merge them without an explicit user decision — this has been deliberately deferred twice already.

---

## Step 0 — Read Before Touching

Before writing a single line:

1. Read every file named in the task, in full — not a grep snippet.
2. Read the direct dependencies: if you're touching `devotional-loader.js`, also read `devotional-i18n-adapter.js` (the seam it depends on) and the relevant `devocionales/lang/*.json` file(s).
3. If the task touches i18n copy — check **all 10 (or 7) language JSON files** have the key, not just `es`/`en`. A key added to one language and forgotten in the other nine is the single most common mistake in this repo's history.
4. If the task touches shared CSS (`modern.css`, `language-selector.css`) — grep for every `<link>` that loads it. These files are shared across 3–6 pages; a change "for one page" silently changes all of them. This has caused a real bug this session (a blanket `footer, footer * { color: white !important }` rule breaking a different page's footer).
5. If the task touches a file that exists in two copies (root `js/` vs `devocionales/js/`) — check which pages load which copy before assuming they're interchangeable. `grep -rn "path/to/file" --include="*.html" .`

**Never edit a file you haven't read in full. Never assume two same-named files are identical — check with `diff`.**

### Think Before Coding

- **State your assumptions explicitly.** If uncertain about scope, ask — don't guess and ship.
- **If multiple valid interpretations exist, present them.** Do not silently pick one.
- **If a simpler approach exists, say so.** Push back when warranted.
- **If something is unclear, stop.** This repo has a real cost history for guessing wrong (see Hindi TTS investigation below — an initial "obvious" fix attempt was wrong and had to be reverted mid-session).

---

## Step 1 — Apply the Task

- Follow the request exactly. Do not refactor adjacent code "while you're in there."
- Do NOT add new files, dependencies, or build tooling not explicitly requested. This repo has zero dependencies today — that's a deliberate property, not an oversight. Adding `npm install X` is a hard stop; ask first.
- Do NOT change which languages are supported, which default language is used, or which localStorage keys are used without explicit instruction — these are cross-cutting and have broken things before.
- If a fix touches logic **ported from the Flutter app** (`bible-text-formatter.js` ↔ `devocional_nuevo/lib/services/tts/bible_text_formatter.dart`, `hindi_tts_normalizer.dart`) — check the Dart source before assuming JS-only behavior is correct or before deciding whether a bug is JS-only or shared. Fixing only one side creates a new divergence. If you fix one side, either fix both or explicitly flag the divergence and ask.

### Surgical Changes

- Every changed line must trace directly to the request.
- Remove imports/variables/functions your change made unused. Do not remove pre-existing dead code unless asked — flag it instead (see `heroCredit` key, `debounce()` in `modern.js`, `version` param in `bible-text-formatter.js` — all known, all left alone deliberately).
- Match existing style even if you'd write it differently.

---

## Step 2 — Mandatory Quality Gates

Run these in order after every change, before reporting done.

### Define Success Criteria First

Transform the task into a verifiable goal before starting:
- `"Fix the bug"` → `"Write/update a test that reproduces it, make it pass, verify in headless Chrome"`
- `"Add a feature"` → `"Add the UI, wire i18n for all languages, verify DOM state + zero console errors in headless Chrome"`
- `"Refactor X"` → `"node --test passes before and after, headless Chrome shows identical output before and after"`

### Gate 1 — Syntax check every edited `.js` file
```bash
node --check path/to/file.js
```
Zero tolerance. This alone would have caught both historical `i18n.js` corruption incidents in seconds instead of a full session.

### Gate 2 — Lint (ESLint, Stylelint, html-validate)

**None of these tools are installed in the repo** (no `package.json`, no `node_modules`) — this is normal, not broken. Install to a scratch dir, don't touch the repo:

```bash
mkdir -p /tmp/lint-tools && cd /tmp/lint-tools
npm install --no-save eslint@8 stylelint@15 stylelint-config-standard@34 html-validate@8
```

Then from the repo root:
```bash
/tmp/lint-tools/node_modules/.bin/eslint "devocionales/js/*.js" "js/*.js" "habitus/js/*.js"
/tmp/lint-tools/node_modules/.bin/stylelint "devocionales/css/*.css" "css/*.css" "habitus/css/*.css" --config-basedir /tmp/lint-tools/node_modules
/tmp/lint-tools/node_modules/.bin/html-validate "devocionales/*.html" "*.html" "habitus/*.html"
```

**Known accepted false positives — do not "fix" these, they are correct code:**
- ESLint `no-undef` on `DevotionalI18n`, `BibleTextFormatter`, `lucide`, `i18n` — these are real cross-`<script>` globals ESLint can't see without a `.eslintrc` `globals` block (not configured; adding one is a fine, low-risk task if you want to reduce noise, but don't chase these findings as bugs).
- ESLint `no-constant-condition` on `while (true)` in `devotional-loader.js` (`findEarliestDate`/`findLatestDate`) — intentional bounded-by-`break` fallback walkers.
- ESLint `no-control-regex` in `bible-text-formatter.js`'s `sanitizeInput` — the regex's whole purpose is stripping control characters.
- ESLint `no-undef` (`require`, `global`, `__dirname`) in `*.test.js` files — Node CommonJS globals, correct usage, `.eslintrc.json`'s `env` doesn't include `node`.
- html-validate `attribute-allowed-values`/`empty-heading`/`wcag/h30` on `devocionales/index.html`'s `hero-image src=""`, `devotional-verse-ref` empty `<h1>`, `app-banner-cta` empty anchor text — all intentionally empty in markup, populated by `devotional-loader.js` immediately after page load. Verify this in headless Chrome before assuming it's a real bug.
- html-validate `no-redundant-for` on the theme-toggle `<label for="theme-toggle">` wrapping its own `<input>` — harmless, `for` is redundant but not wrong.

**Real findings to actually fix** (examples from this repo's history — the pattern to look for): missing `type="button"` on buttons inside pages with no `<form>` (silent-submit risk if a form is ever added later), icon-only links with `title` but no `aria-label` (screen readers don't reliably announce `title`), genuine duplicate CSS selectors, genuinely unused variables that aren't part of a documented public API.

Stylelint will surface a long tail of pure style-convention findings (hex-length, media-feature-range-notation, selector ordering) from `stylelint-config-standard` — these are not bugs. Do not mass-fix them speculatively; they're not part of "fix the pending items" unless the user asks for a style-convention pass specifically.

### Gate 3 — `node --test`

```bash
node --test
```
(Run from repo root — **not** `node --test devocionales/js/`, that does not work as a directory argument on this Node version, confirmed the hard way.) Currently covers `bible-text-formatter.js` (12 tests, all 10 languages, pure functions, no DOM). Zero tolerance for failures. If your change touches `bible-text-formatter.js`, update or add tests in `bible-text-formatter.test.js` — every language, every branch you touched.

### Gate 4 — Headless Chrome runtime verification (CDP)

**This is not optional for anything touching HTML/JS behavior.** `node --check` and lint catch syntax and style; neither catches "the page renders a blank screen" or "the button doesn't do anything" — both have happened in this repo's history and passed every static check.

Pattern (Node 22 has a built-in `WebSocket`, no puppeteer needed or wanted):
```bash
python3 -m http.server <PORT> --bind 127.0.0.1 &
google-chrome --headless --disable-gpu --no-sandbox \
  --remote-debugging-port=<PORT2> --remote-allow-origins=* about:blank &
```
Then a small Node script: `PUT http://127.0.0.1:<PORT2>/json/new?about:blank` to get a `webSocketDebuggerUrl`, open a `WebSocket` to it, send `Runtime.enable`, `Network.setCacheDisabled`, `Page.navigate`, then `Runtime.evaluate` (`returnByValue: true`) to read back DOM/JS state. Listen for `Runtime.exceptionThrown` — that's your console-error signal. For visual checks, add `Emulation.setDeviceMetricsOverride` + `Page.captureScreenshot`.

**Always `pkill -f "http.server <PORT>"` and `pkill -f "remote-debugging-port=<PORT2>"` after each round.** Stray background instances from earlier rounds cause port-already-bound confusion — this has wasted real time this session.

Minimum bar for "verified": zero `Runtime.exceptionThrown` events, and the specific DOM state you changed actually reflects the change (don't just check "page loaded" — check the actual value/text/attribute you touched).

**Responsive check**, when the change touches layout: `Emulation.setDeviceMetricsOverride` at phone (375×667, 390×844) and tablet (768×1024, 1024×768) widths; `document.body.scrollWidth > window.innerWidth` is a fast overflow signal before eyeballing a screenshot.

**Regression discipline:** for anything shared (CSS files loaded by multiple pages, i18n default-language changes, localStorage key changes), verify **every page that loads the shared file**, not just the one you meant to change. Compare output before/after — `git stash` the change, capture baseline state, `git stash pop`, compare.

---

## Step 3 — i18n Discipline (this repo's #1 recurring bug source)

Every hardcoded UI string found in an HTML file is a bug waiting to be filed, even if it "looks fine right now" in the default language. This repo's history: hardcoded nav labels, footer text, and error copy have each individually caused a "why isn't this translating" bug report.

Checklist for any UI copy change:
1. Does this string live in a `devocionales/lang/{lang}.json` (or `lang/home/{lang}.json`) file under the right key, for **all** languages that section supports?
2. Is it read via `DevotionalI18n.t('devotionals.key', fallback)` (devocionales) or `window.i18n.t('key')` / `data-i18n` attribute (root/habitus) — never a literal string in the HTML or JS?
3. If you added a key to `es.json`, did you add it to the other 9 (or 6)? `for f in devocionales/lang/*.json; do python3 -c "import json; d=json.load(open('$f')); print('$f', d['devotionals'].get('yourNewKey'))"; done` — every line should show a real value, not `None`.
4. Did you validate every JSON file parses? `for f in devocionales/lang/*.json; do python3 -c "import json; json.load(open('$f'))" || echo "$f FAILED"; done`
5. Verify in headless Chrome with at least 2 languages (e.g. `?lang=en` and `?lang=es`), not just the default.

---

## Step 4 — SOLID-lite for Vanilla JS

There's no DI container or class hierarchy here — SOLID applies loosely, but the spirit matters:

- **Single Responsibility:** `devotional-i18n-adapter.js` exists specifically as a thin seam so `devotional-loader.js` depends on a small stable contract (`DevotionalI18n.t/getLanguage/onLanguageChanged/whenReady`) instead of reaching into `window.i18n` directly. Preserve this boundary — don't add direct `window.i18n.*` calls to `devotional-loader.js`.
- **Open/Closed:** language-specific formatting rules belong in per-language data tables (`BIBLE_VERSION_EXPANSIONS`, `LANGUAGE_VERSIONS`, `LOCALE_TAGS`), not `if (lang === 'x')` branches sprinkled through logic. Adding a language should mean adding a table entry, not editing control flow.
- **Don't duplicate config that's supposed to be data.** `LANGUAGE_VERSIONS` (which Bible edition per language) is data-fetching config and correctly lives in `devotional-loader.js`, separate from `i18n.js`'s translated-copy concern. Don't blur this line.
- **Dead code:** flag it, don't silently delete it unless asked (see `heroCredit`, `debounce()`) — but don't add more of it either.

---

## Step 5 — Cross-File Port Discipline (Dart ↔ JS)

`bible-text-formatter.js` is a deliberate port of `devocional_nuevo/lib/services/tts/bible_text_formatter.dart` (path: `/home/develop4god/Projects/devocional_nuevo/`), including `hindi_tts_normalizer.dart`. Both files carry a header comment saying so — respect it.

- Before fixing a bug in either file, **check the other**. A bug ported faithfully from Dart is not "this session's fault" and fixing only the JS side creates a new divergence.
- If a fix changes *behavior* (not just adds a missing entry) — get explicit confirmation before touching both files. A pipeline-ordering fix that seems obviously correct can have effects you haven't verified across all input shapes (this happened this session: an initial Hindi substring-collision fix attempt made things worse and had to be reverted after root-causing the real issue was a `HindiTtsNormalizer.preProcess()` ordering interaction, not the key-ordering bug originally assumed).
- Missing-entirely (e.g. `fr` had no entry in the JS `BIBLE_VERSION_EXPANSIONS` while Dart did) is safe to port directly — that's restoring parity, not changing behavior.

---

## Step 6 — Report Format

```
✅ Changes Applied
[File] — what changed (1 line per file)

🔬 Quality Gates
- node --check: ✅ clean / ❌ [file:line]
- eslint/stylelint/html-validate: ✅ no new findings / ⚠️ [N findings — real vs. known-false-positive breakdown]
- node --test: ✅ [N] passed / ❌ [N failed]
- Headless Chrome verification: ✅ [what was checked, zero console errors] / ❌ [issue]
- Responsive check (if layout touched): ✅ no overflow at phone/tablet / ❌ [issue]

🌍 i18n Check (if UI copy touched)
✅ All [10/7] languages updated, JSON validated, verified in 2+ languages
— OR —
⚠️ [language] missing key [key]

🧪 Tests Added/Updated
[Test file] — [what's covered]
— OR —
N/A — [reason, e.g. "DOM-only change, no pure-function logic to unit test"]

🚫 Flags for User
[Ambiguity, pre-existing issues found, scope questions, anything requiring
 a judgment call you didn't make unilaterally]
— OR —
None
```

---

## Non-Negotiable Rules Summary

| Rule | Consequence of violation |
|---|---|
| `node --check` not run on every edited `.js` | Do not report done |
| Headless Chrome verification skipped for HTML/JS behavior changes | Do not report done — static checks alone have missed real breakage twice in this repo's history |
| i18n copy added to only some language files | Hard block — fix before done |
| `node --test` has failures | Do not report done — fix or explicitly flag as pre-existing |
| New npm dependency added without asking | Hard block — this repo has zero dependencies by design |
| Shared CSS/JS file changed without checking all pages that load it | Hard block — verify every consumer, not just the one you meant to change |
| Dart/JS port touched on only one side without checking the other | Flag and ask, unless it's a clear missing-entirely gap being restored |
| Guessing instead of asking when a fix's correctness is uncertain | Not allowed — this session had a real instance of a "confident" fix making a bug worse; investigate fully or ask before shipping |

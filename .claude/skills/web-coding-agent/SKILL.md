---
name: web-coding-agent
description: Day-to-day coding agent execution rules for develop4God.github.io (static HTML/CSS/JS, no bundler, no framework, GitHub Pages + Cloudflare Pages). Load this skill before making any code change, applying any delegation block, implementing any feature, or fixing any bug in this repo. Enforces mandatory quality gates (node --check, eslint, stylelint, html-validate, node --test, c8 coverage report), Playwright-based browser runtime verification, SOLID-lite discipline for a vanilla-JS site, and regression-test coverage on every fix. Use when the user says "apply this", "implement this", "make this change", "fix this bug", "add this feature", or hands you any delegation block targeting this repo.
---

# Web Coding Agent — Execution Rules

You are a coding agent executing tasks in `develop4God.github.io` — a static, multi-section site (root marketing hub, `/devocionales/` daily devotional reader, `/habitus/`) with **no build step, no bundler, no framework, no package.json**. Every `<script>` tag is a real, separately-loaded global-scope file. There is no compiler to catch a typo — verification is entirely your responsibility.

You do not design architecture. You do not decide between patterns unprompted. You apply what is given, stay in scope, and verify your own work before declaring done.

You do not skip verification because "it's just HTML/CSS/JS." This codebase has a documented history of exactly that assumption causing real breakage: two independently corrupted `i18n.js` files that silently blanked legal pages, went undetected for a full session each time.

---

## Project Identity

- **Repo:** `develop4God/develop4God.github.io`
- **Stack:** Vanilla HTML/CSS/JS, Tailwind via CDN `<script>`, Lucide icons via CDN. No npm install, no build step. Deploys directly to GitHub Pages / Cloudflare Pages from the repo as-is.
- **Sections, each with their own `css/`, `js/`:**
  - `/` (root) — marketing hub, uses `js/home.js` (JSON-fetch i18n; `js/i18n.js` was dead code, removed); lang files at `lang/home/`
  - `/devocionales/` — daily devotional reader (`devocionales/index.html`), uses `devocionales/js/i18n.js` + `devocionales/js/devotional-loader.js` + `devocionales/js/devotional-i18n-adapter.js`; lang files at `lang/devocionales/` (namespace-first, matching root/habitus — moved from `devocionales/lang/`)
  - `/habitus/` — separate mini-app, uses `habitus/js/habitus.js`; lang files at `lang/habitus/`
- **i18n:** 10 languages for devocionales (es/en/pt/fr/ja/zh/hi/de/ar/fil), 7 for root/habitus (es/en/pt/fr/zh/ja/hi). Default/fallback language is **English** (`en`), site-wide, as of 2026-07. Language preference persists across all three sections via a single shared `localStorage` key: `develop4God_language`.
- **Known architectural debt (do not silently "fix" — flag and ask):** each section (root, devocionales, habitus, work-with-me) runs its own independent i18n implementation (JSON-fetch pattern, but separate modules/files). They share a localStorage key now but are not otherwise consolidated. Do not merge them without an explicit user decision.

---

## Step 0 — Read Before Touching

Before writing a single line:

1. Read every file named in the task, in full — not a grep snippet.
2. Read the direct dependencies: if you're touching `devotional-loader.js`, also read `devotional-i18n-adapter.js` (the seam it depends on) and the relevant `lang/devocionales/*.json` file(s).
3. If the task touches i18n copy — check **all 10 (or 7) language JSON files** have the key, not just `es`/`en`. A key added to one language and forgotten in the other nine is the single most common mistake in this repo's history.
4. If the task touches shared CSS (`modern.css`, `language-selector.css`) — grep for every `<link>` that loads it. These files are shared across 3–6 pages; a change "for one page" silently changes all of them. This has caused a real bug this session (a blanket `footer, footer * { color: white !important }` rule breaking a different page's footer).
5. If the task touches a file that exists in two copies (root `js/` vs `devocionales/js/`) — check which pages load which copy before assuming they're interchangeable. `grep -rn "path/to/file" --include="*.html" .`

**Never edit a file you haven't read in full. Never assume two same-named files are identical — check with `diff`.**

6. **Before hardcoding any content-shaped data — lists, name mappings,
   copyright/legal text, image filenames, version tables, anything that
   isn't logic — check whether it already has a canonical source:**
   `Devocionales-json` (devotional content, `index.json`, Bible-version
   metadata), `Devocionales-assets` (images), or a Dart file in
   `devocional_nuevo` treated as the app's own SOT (e.g.
   `copyright_utils.dart`, `bible_version_registry.dart`). If a source
   exists, fetch it or reference it remotely — don't transcribe it into a
   JS/JSON literal in this repo, even if that's faster to ship. If you
   genuinely can't wire up a live fetch in scope, that's a real
   constraint — say so explicitly and ask, rather than silently
   hardcoding a local copy and filing "make this dynamic later" as a
   backlog item. A hardcoded copy of data that has a canonical source
   is a second copy that will drift, not a shortcut — this has already
   happened twice: `HABITUS_IMAGES` (a 23-item filename array in
   `devotional-loader.js`, when the images live in `Devocionales-assets`)
   and `BIBLE_VERSION_INFO` (version names + copyright text transcribed
   from `devocional_nuevo`'s Dart source instead of fetched from a shared
   JSON source). Reaching for "hardcode it" as the default because it's
   fastest for the task in front of you is exactly the mistake to avoid.

7. **GATE — before writing any code that touches an existing file, do a
   SOLID/god-object check on that file, out loud, and surface it to the
   user before coding — do not silently decide and proceed:** does this
   file already show the god-object smell (many unrelated top-level
   functions/responsibilities — `devotional-loader.js` is the standing
   example)? If yes, is the change you're about to make a distinct
   concern that should be extracted into its own file *right now*, in
   this same change, rather than added as one more top-level function?
   State the finding and your extraction suggestion to the user and get
   their confirmation before starting to code — this is a discussion
   gate, not a check you resolve on your own and report after the fact.
   This is not optional and not deferrable to "a future refactor" — see
   Step 4's SOLID-lite section for the extraction pattern
   (`window.XyzHelper` in its own `<script>`-loaded file,
   dependency-injected like `devotional-nav.js`/`bible-text-formatter.js`).
   Do this check, and have the discussion, before Step 1 (Apply the
   Task) — not after.

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
- `"Fix the bug"` → `"Write/update a test that reproduces it, make it pass, verify with Playwright"`
- `"Add a feature"` → `"Add the UI, wire i18n for all languages, verify DOM state + zero console errors via Playwright"`
- `"Refactor X"` → `"node --test passes before and after, Playwright spec shows identical output before and after"`

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

**Every new cross-`<script>` global MUST be added to `.eslintrc.json`'s `globals` block in the same commit that introduces it.** `.eslintrc.json` already has this block configured (`DevotionalI18n`, `BibleTextFormatter`, `DevotionalShare`, etc.) specifically so eslint runs clean — a genuinely zero-dependency site is not a reason to tolerate `no-undef` noise as "expected." If you add a new `window.XyzHelper = {...}` module (see Step 4's SOLID pattern), register its name in `.eslintrc.json` before reporting the task done. Do not describe `no-undef` on a real global as a "known false positive to leave alone" — that is hand-waving past a one-line fix, not a legitimate exception. This was gotten wrong once (three new modules — `DevotionalFetch`, `DevotionalNav`, `DevotionalErrorLogger` — shipped across several commits before the config was updated, and eslint noise was excused as "expected" instead of fixed immediately) — don't repeat it.

**Known accepted false positives — genuinely cannot be configured away, do not "fix" these:**
- ESLint `no-constant-condition` on `while (true)` in `devotional-loader.js` (`findEarliestDate`/`findLatestDate`) — intentional bounded-by-`break` fallback walkers.
- ESLint `no-control-regex` in `bible-text-formatter.js`'s `sanitizeInput` — the regex's whole purpose is stripping control characters.
- ESLint `no-undef` (`require`, `global`, `__dirname`) in `*.test.js` files — Node CommonJS globals, correct usage, `.eslintrc.json`'s `env` doesn't include `node`.
- html-validate `attribute-allowed-values`/`empty-heading`/`wcag/h30` on `devocionales/index.html`'s `hero-image src=""`, `devotional-verse-ref` empty `<h1>`, `app-banner-cta` empty anchor text — all intentionally empty in markup, populated by `devotional-loader.js` immediately after page load. Verify this with a Playwright check before assuming it's a real bug.
- html-validate `no-redundant-for` on the theme-toggle `<label for="theme-toggle">` wrapping its own `<input>` — harmless, `for` is redundant but not wrong.

**Real findings to actually fix** (examples from this repo's history — the pattern to look for): missing `type="button"` on buttons inside pages with no `<form>` (silent-submit risk if a form is ever added later), icon-only links with `title` but no `aria-label` (screen readers don't reliably announce `title`), genuine duplicate CSS selectors, genuinely unused variables that aren't part of a documented public API.

Stylelint will surface a long tail of pure style-convention findings (hex-length, media-feature-range-notation, selector ordering) from `stylelint-config-standard` — these are not bugs. Do not mass-fix them speculatively; they're not part of "fix the pending items" unless the user asks for a style-convention pass specifically.

### Gate 3 — `node --test`

```bash
node --test
```
(Run from repo root — **not** `node --test devocionales/js/`, that does not work as a directory argument on this Node version, confirmed the hard way.) Currently covers `bible-text-formatter.js` (12 tests, all 10 languages, pure functions, no DOM), `devotional-progress.js` (date-math + localStorage progress), and `devotional-tts.js`'s `buildTtsText` (pure text-assembly, real i18n copy, no DOM/speechSynthesis). Zero tolerance for failures. If your change touches a file with a matching `*.test.js`, update or add tests there — every language/branch you touched.

**Gate 3a — Red/green is mandatory for every bug fix, not just "add a test."** A test that only ever ran against the fixed code proves nothing — it could pass by coincidence, assert the wrong thing, or not actually exercise the broken path. For every bug fix (new test or updated existing one):
1. Write the test asserting the *correct* behavior.
2. Prove it fails against the pre-fix code, for the right reason — not a crash or unrelated error. The fastest way: `git stash` your fix (keep the new test), run the test, confirm it fails with an assertion that matches the actual bug (not a syntax error or missing file), then `git stash pop` to restore the fix.
3. Confirm it passes against the fixed code.
4. Report both outcomes explicitly (see Gate 3a line in Step 6's report format) — "tests added" alone is not sufficient, state that red was confirmed and why it failed, then that green was confirmed after.

This is exactly how the `renderLegalPrivacy()` section-2 list-item bug was verified: the regression test was run against a copy of the pre-fix `i18n.js` from `main`, confirmed to fail with the missing list items (and the code's own "[Error] missing sections" fallback firing, showing the bug was worse than a cosmetic gap), then confirmed to pass once the fix was restored. A test that was only ever run once, against already-fixed code, does not meet this gate.

**Module-loading pattern for any newly-extracted pure-logic module:** load the real browser-IIFE source with `vm.runInThisContext`, passing an explicit `filename` option — **not** `new Function('window', source)`. Both execute the code identically, but `new Function` produces an anonymous eval with no source location, so c8/V8 cannot attribute coverage back to the real file — it silently reports 0% (or omits the file entirely) even when every line actually ran under real tests. This was caught the hard way: `devotional-progress.test.js`/`devotional-tts.test.js` initially used `new Function` and showed 0% coverage for both modules despite 100% of their tests passing, while `bible-text-formatter.test.js` (which already used the correct pattern) showed real, accurate numbers. The correct form:
```js
const vm = require('node:vm');
const filename = path.join(__dirname, 'the-module.js');
const source = fs.readFileSync(filename, 'utf8');
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
```
No hand-written fakes of the module under test — see `devotional-progress.test.js`/`devotional-tts.test.js` for the localStorage/global-identifier stand-ins this pattern requires (bare `localStorage`/`DevotionalI18n`/etc. inside a browser IIFE resolve to `global.*` in Node, not `window.*` — set both, or set the global directly, matching what the module's own bare identifiers will actually resolve to).

### Gate 3b — `c8` coverage report

```bash
npx c8 node --test
npx c8 report --reporter=text --reporter=html
```
Not a bundler dependency — installs to npx's cache on demand, same zero-footprint convention as eslint/stylelint/Playwright. Report-only: there is no enforced minimum threshold, so a lower number doesn't block the gate — but read the text report and flag any newly-added pure-logic file that shows as uncovered or thin, rather than silently shipping it. Use it to catch exactly the gap this repo hit once already: a god-object split (`devotional-loader.js` → 5 modules) that shipped with zero unit coverage on its pure functions, relying only on Playwright's incidental UI-interaction coverage.

### Gate 4 — Browser runtime verification (Playwright)

**This is not optional for anything touching HTML/JS behavior.** `node --check` and lint catch syntax and style; neither catches "the page renders a blank screen" or "the button doesn't do anything" — both have happened in this repo's history and passed every static check.

Uses [Playwright](https://playwright.dev), the standard tool for this job — not hand-rolled CDP/WebSocket calls (an earlier version of this gate did that; it was replaced because stray Chrome processes from prior rounds kept colliding on debug ports, and the protocol code had to be re-derived each session instead of being a real, versioned test). Playwright is **not a repo dependency** — install to a scratch dir once per machine/session, same convention as eslint/stylelint/html-validate:

```bash
mkdir -p /tmp/pw-tools && cd /tmp/pw-tools
npm install --no-save playwright @playwright/test
npx playwright install chromium
```

Real, versioned test specs live in `e2e/*.spec.js` (see `e2e/README.md`). Run them from the repo root:
```bash
/tmp/pw-tools/node_modules/.bin/playwright test -c e2e/
```
The config's `webServer` block starts/stops the local server for you — no manual process juggling, no port-collision cleanup.

**If your change touches a page covered by an existing spec** (currently `e2e/devocionales-reader.spec.js` — all 10 languages, TTS button click, prev/next nav) — run it and it must pass. **If your change adds new interactive behavior** (a new button, a new nav flow, a new page) — add a spec or extend an existing one; don't just eyeball it once and move on. Assert on real state: text that should have changed, an element that should be visible, `consoleErrors` empty — not just "the page returned 200."

Minimum bar for "verified": zero console/page errors, and the specific state you changed actually reflects the change.

**Responsive check**, when the change touches layout: `page.setViewportSize({ width, height })` at phone (375×667, 390×844) and tablet (768×1024, 1024×768) widths; `page.evaluate(() => document.body.scrollWidth > window.innerWidth)` is a fast overflow signal before `page.screenshot()`.

**Regression discipline:** for anything shared (CSS files loaded by multiple pages, i18n default-language changes, localStorage key changes), verify **every page that loads the shared file**, not just the one you meant to change. Compare output before/after — `git stash` the change, capture baseline state, `git stash pop`, compare.

---

## Step 3 — i18n Discipline (this repo's #1 recurring bug source)

Every hardcoded UI string found in an HTML file is a bug waiting to be filed, even if it "looks fine right now" in the default language. This repo's history: hardcoded nav labels, footer text, and error copy have each individually caused a "why isn't this translating" bug report.

Checklist for any UI copy change:
1. Does this string live in a `lang/devocionales/{lang}.json` (or `lang/home/{lang}.json`) file under the right key, for **all** languages that section supports?
2. Is it read via `DevotionalI18n.t('devotionals.key', fallback)` (devocionales) or `window.i18n.t('key')` / `data-i18n` attribute (root/habitus) — never a literal string in the HTML or JS?
3. If you added a key to `es.json`, did you add it to the other 9 (or 6)? `for f in lang/devocionales/*.json; do python3 -c "import json; d=json.load(open('$f')); print('$f', d['devotionals'].get('yourNewKey'))"; done` — every line should show a real value, not `None`.
4. Did you validate every JSON file parses? `for f in lang/devocionales/*.json; do python3 -c "import json; json.load(open('$f'))" || echo "$f FAILED"; done`
5. Verify with Playwright across at least 2 languages (e.g. `?lang=en` and `?lang=es`), not just the default.

---

## Step 4 — SOLID-lite for Vanilla JS

There's no DI container or class hierarchy here — SOLID applies loosely, but the spirit matters:

- **Single Responsibility:** `devotional-i18n-adapter.js` exists specifically as a thin seam so `devotional-loader.js` depends on a small stable contract (`DevotionalI18n.t/getLanguage/onLanguageChanged/whenReady`) instead of reaching into `window.i18n` directly. Preserve this boundary — don't add direct `window.i18n.*` calls to `devotional-loader.js`.
- **Open/Closed:** language-specific formatting rules belong in per-language data tables (`BIBLE_VERSION_EXPANSIONS`, `LANGUAGE_VERSIONS`, `LOCALE_TAGS`), not `if (lang === 'x')` branches sprinkled through logic. Adding a language should mean adding a table entry, not editing control flow.
- **Don't duplicate config that's supposed to be data.** `LANGUAGE_VERSIONS` (which Bible edition per language) is data-fetching config and correctly lives in `devotional-loader.js`, separate from `i18n.js`'s translated-copy concern. Don't blur this line.
- **Dead code:** flag it, don't silently delete it unless asked (see `heroCredit`, `debounce()`) — but don't add more of it either.
- **A file already showing the god-object smell (many unrelated top-level functions/responsibilities — `devotional-loader.js` is the standing example) must be flagged and the specific new logic extracted into its own file, every time you touch it — not grown further "just this once."** Before adding a new function/feature to such a file, name its responsibility out loud and ask: does this belong in its own file instead? If yes, extract it now, in the same change — don't defer cleanup to "later" or wait for the user to notice and push back. This was gotten wrong once: `devotional-loader.js` kept growing (nav-availability calls, error-logger calls, support-button wiring) across an entire session's worth of unrelated fixes without ever proposing an extraction, until the user had to explicitly call it out. See [[project_devotional_loader_extraction]] / `feedback_no_handwaving_fix_it_now` in memory.

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
- c8 coverage: ✅ [% for any file touched/added] / ⚠️ [new pure-logic file shipped uncovered — flag it]
- Playwright verification: ✅ [what was checked, zero console errors] / ❌ [issue]
- Responsive check (if layout touched): ✅ no overflow at phone/tablet / ❌ [issue]

🌍 i18n Check (if UI copy touched)
✅ All [10/7] languages updated, JSON validated, verified in 2+ languages
— OR —
⚠️ [language] missing key [key]

🧪 Tests Added/Updated
[Test file] — [what's covered]
— Red/green: ✅ confirmed test fails against pre-fix code ([why it failed]), passes against the fix
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
| Playwright verification skipped for HTML/JS behavior changes | Do not report done — static checks alone have missed real breakage twice in this repo's history |
| i18n copy added to only some language files | Hard block — fix before done |
| `node --test` has failures | Do not report done — fix or explicitly flag as pre-existing |
| Bug-fix test added/updated without confirming it fails against pre-fix code | Do not report done — a test never shown red proves nothing; re-run it against the pre-fix code (`git stash` the fix) before claiming coverage |
| New pure-logic module shipped with no c8-visible test coverage | Flag it — no enforced threshold, but silent 0% on new logic is exactly the gap this rule exists to catch |
| New `*.test.js` loads browser-IIFE source via `new Function` instead of `vm.runInThisContext` | Fix before done — c8 can't attribute coverage to an anonymous eval, so it silently under-reports |
| New npm dependency added without asking | Hard block — this repo has zero dependencies by design |
| Shared CSS/JS file changed without checking all pages that load it | Hard block — verify every consumer, not just the one you meant to change |
| Dart/JS port touched on only one side without checking the other | Flag and ask, unless it's a clear missing-entirely gap being restored |
| Guessing instead of asking when a fix's correctness is uncertain | Not allowed — this session had a real instance of a "confident" fix making a bug worse; investigate fully or ask before shipping |

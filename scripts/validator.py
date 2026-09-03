#!/usr/bin/env python3
"""
validate.py — phased pre-commit validator for develop4God.github.io.

Runs every gate documented in .claude/skills/web-coding-agent/SKILL.md, in
order, stopping at the first phase that fails so you don't have to run each
tool by hand. Mirrors .github/workflows/*.yml's commands exactly (same tool
versions, same file globs) so a local pass means CI will pass too.

  PHASE 1: node --check      — syntax, every tracked .js file
  PHASE 2: eslint             — devocionales/js, js, habitus/js
  PHASE 3: stylelint          — every .css file
  PHASE 4: html-validate      — root/devocionales/habitus .html
  PHASE 5: node --test        — unit tests (bible-text-formatter, devotional-progress, devotional-tts)
  PHASE 6: c8 coverage        — report-only, no enforced threshold (npx, scratch-installed)
  PHASE 7: Playwright e2e     — full browser runtime verification (e2e/)
  PHASE 8: SOT manifest       — fetches Devocionales-assets' devotionals
                                 index.json and validates its shape

Lint tools are expected globally installed at the CI-pinned versions
(html-validate@8, stylelint@15, stylelint-config-standard@34, eslint@8) —
run `npm install -g html-validate@8 stylelint@15 stylelint-config-standard@34
eslint@8` once. Playwright is expected at /tmp/pw-tools (the session-scratch
convention documented in the skill) — run the install block there once per
session if missing.

Exit codes: 0 = all phases passed, 1 = a phase failed (or a required tool
is missing).
"""

import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PW_TOOLS = Path('/tmp/pw-tools/node_modules/.bin/playwright')
DEVOTIONALS_INDEX_URL = (
    'https://raw.githubusercontent.com/develop4God/Devocionales-assets/'
    'main/images/devotionals/index.json'
)


class Report:
    def __init__(self, phase: str):
        self.phase = phase
        self.errors = []

    def E(self, msg):
        self.errors.append(msg)


class Phase:
    def __init__(self, name: str, passed: bool, elapsed: float, skipped_reason: str = ''):
        self.name = name
        self.passed = passed
        self.elapsed = elapsed
        self.skipped_reason = skipped_reason


PHASES: list[Phase] = []


def run_cmd(cmd, cwd=REPO_ROOT):
    result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    return result.returncode, result.stdout, result.stderr


def gate(name: str, fn):
    print(f"\n{'=' * 70}")
    print(f"PHASE: {name}")
    print('=' * 70)
    start = time.monotonic()
    ok, skip_reason = fn()
    elapsed = time.monotonic() - start
    PHASES.append(Phase(name, ok, elapsed, skip_reason))
    if skip_reason:
        print(f"⬜ SKIPPED  ({elapsed:.1f}s) — {skip_reason}")
        return
    if ok:
        print(f"✅ PASSED  ({elapsed:.1f}s)")
    else:
        print(f"❌ FAILED  ({elapsed:.1f}s)")
        print_summary()
        sys.exit(1)


def print_summary():
    print(f"\n{'=' * 70}")
    print("SUMMARY")
    print('=' * 70)
    for p in PHASES:
        if p.skipped_reason:
            icon = '⬜ SKIP'
        elif p.passed:
            icon = '✅ PASS'
        else:
            icon = '❌ FAIL'
        print(f"  {p.name:<40} {icon}  ({p.elapsed:.1f}s)")
    total = sum(p.elapsed for p in PHASES)
    overall = all(p.passed for p in PHASES)
    print('-' * 70)
    if overall:
        print(f"✅ ALL PHASES PASSED  (total: {total:.1f}s)")
    else:
        print(f"❌ RUN FAILED  (total: {total:.1f}s)")


# ── Phase 1: node --check ────────────────────────────────────────────────

def phase_node_check():
    js_files = sorted(
        f for f in REPO_ROOT.rglob('*.js')
        if 'node_modules' not in f.parts
        and '.claude' not in f.parts
        and 'test-results' not in f.parts
        and 'playwright-report' not in f.parts
    )
    if not js_files:
        return True, 'no .js files found'
    ok = True
    for f in js_files:
        rc, _out, err = run_cmd(['node', '--check', str(f)])
        if rc != 0:
            print(f"  ❌ {f.relative_to(REPO_ROOT)}")
            print(f"     {err.strip()}")
            ok = False
        else:
            print(f"  ✓ {f.relative_to(REPO_ROOT)}")
    return ok, ''


# ── Phase 2-4: lint (global installs, matching CI exactly) ──────────────

def _tool_missing(name: str) -> bool:
    return shutil.which(name) is None


def phase_eslint():
    if _tool_missing('eslint'):
        return False, 'eslint not found on PATH — npm install -g eslint@8'
    rc, out, err = run_cmd(['eslint', '**/*.js', '--ignore-pattern', 'node_modules/'])
    print(out)
    if err.strip():
        print(err)
    return rc == 0, ''


def phase_stylelint():
    if _tool_missing('stylelint'):
        return False, 'stylelint not found on PATH — npm install -g stylelint@15 stylelint-config-standard@34'
    rc, out, err = run_cmd(['stylelint', '**/*.css', '--allow-empty-input'])
    print(out)
    if err.strip():
        print(err)
    return rc == 0, ''


def phase_html_validate():
    if _tool_missing('html-validate'):
        return False, 'html-validate not found on PATH — npm install -g html-validate@8'
    rc, out, err = run_cmd(['html-validate', '*.html', 'devocionales/*.html', 'habitus/*.html'])
    print(out)
    if err.strip():
        print(err)
    return rc == 0, ''


# ── Phase 5: node --test ─────────────────────────────────────────────────

def phase_node_test():
    rc, out, err = run_cmd(['node', '--test'])
    print(out)
    if err.strip():
        print(err)
    return rc == 0, ''


# ── Phase 6: c8 coverage (report-only, no enforced threshold) ───────────

def phase_c8_coverage():
    if _tool_missing('npx'):
        return False, 'npx not found on PATH — install Node.js'
    rc, out, err = run_cmd(['npx', '--yes', 'c8', 'node', '--test'])
    if rc != 0:
        print(out)
        print(err)
        return False, ''
    rc2, out2, err2 = run_cmd(['npx', '--yes', 'c8', 'report', '--reporter=text'])
    print(out2)
    if err2.strip():
        print(err2)
    # Report-only: a low/uncovered number never fails this phase — only a
    # tool/runtime error does. Read the printed table and flag any new
    # pure-logic file that shows uncovered, per the skill's Gate 3b.
    return rc2 == 0, ''


# ── Phase 7: Playwright e2e ──────────────────────────────────────────────

def phase_playwright():
    if not PW_TOOLS.exists():
        return False, (
            f'Playwright not found at {PW_TOOLS} — install once per session:\n'
            '    mkdir -p /tmp/pw-tools && cd /tmp/pw-tools\n'
            '    npm install --no-save playwright @playwright/test\n'
            '    npx playwright install chromium'
        )
    rc, out, err = run_cmd([str(PW_TOOLS), 'test', '-c', 'e2e/'])
    print(out)
    if err.strip():
        print(err)
    return rc == 0, ''


# ── Phase 8: SOT manifest (Devocionales-assets devotionals index.json) ──

def phase_devotionals_manifest():
    try:
        with urllib.request.urlopen(DEVOTIONALS_INDEX_URL, timeout=15) as res:
            if res.status != 200:
                return False, ''
            data = json.loads(res.read())
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"  ❌ Could not fetch {DEVOTIONALS_INDEX_URL}: {e}")
        return False, ''
    except json.JSONDecodeError as e:
        print(f"  ❌ Manifest is not valid JSON: {e}")
        return False, ''

    ok = True
    for key in ('version', 'generatedAt', 'files'):
        if key not in data:
            print(f"  ❌ Manifest missing required key: {key!r}")
            ok = False

    files = data.get('files')
    if not isinstance(files, list) or not files:
        print("  ❌ 'files' must be a non-empty list")
        ok = False
    else:
        bad = [f for f in files if not isinstance(f, str) or not f.endswith(('.avif', '.webp'))]
        if bad:
            print(f"  ❌ {len(bad)} file(s) not a .avif/.webp filename: {bad[:5]}")
            ok = False
        else:
            print(f"  ✓ {len(files)} .avif/.webp filenames listed")

    version = data.get('version')
    if not isinstance(version, str) or not version:
        print("  ❌ 'version' must be a non-empty string fingerprint")
        ok = False
    else:
        print(f"  ✓ version: {version}")

    return ok, ''


def main():
    print("develop4God.github.io — pre-commit validation")
    print(f"Repo: {REPO_ROOT}")

    gate('1. node --check (syntax)', phase_node_check)
    gate('2. eslint', phase_eslint)
    gate('3. stylelint', phase_stylelint)
    gate('4. html-validate', phase_html_validate)
    gate('5. node --test', phase_node_test)
    gate('6. c8 coverage', phase_c8_coverage)
    gate('7. Playwright e2e', phase_playwright)
    gate('8. SOT manifest (devotionals index.json)', phase_devotionals_manifest)

    print_summary()
    sys.exit(0 if all(p.passed for p in PHASES) else 1)


if __name__ == '__main__':
    main()

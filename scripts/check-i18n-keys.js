#!/usr/bin/env node
// Validates every locale JSON file in every i18n directory in the repo: each
// file must parse as valid JSON, and every file's key set must exactly match
// the union of keys across ALL locale files in that directory (not just diff
// against one canonical locale — a key present in any locale must be present
// in every locale, and nothing should be missing from all but one).
//
// Targets are discovered, not hardcoded: any directory named "lang" is a
// candidate, and so is any subdirectory of one that directly holds .json
// files (e.g. lang/home/, lang/habitus/) — so a renamed or newly added i18n
// directory is picked up automatically instead of silently going unchecked.
// Usage: node scripts/check-i18n-keys.js

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const SKIP_DIR_NAMES = new Set(['node_modules', 'coverage', '.git']);

function hasJsonFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).some((e) => e.isFile() && e.name.endsWith('.json'));
}

function findLangDirs(dir, found) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === 'lang') {
      if (hasJsonFiles(full)) {
        found.push(full);
      }
      for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
        if (sub.isDirectory() && hasJsonFiles(path.join(full, sub.name))) {
          found.push(path.join(full, sub.name));
        }
      }
    } else {
      findLangDirs(full, found);
    }
  }
  return found;
}

function discoverTargets() {
  return findLangDirs(REPO_ROOT, []).sort();
}

function flatten(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flatten(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function checkDir(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  const parsed = {};
  const parseErrors = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      parsed[file] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      parseErrors.push({ file, message: err.message });
    }
  }

  const keysByFile = {};
  const unionKeys = new Set();
  for (const [file, data] of Object.entries(parsed)) {
    const keys = new Set(flatten(data));
    keysByFile[file] = keys;
    for (const k of keys) unionKeys.add(k);
  }

  const results = [];
  for (const [file, keys] of Object.entries(keysByFile)) {
    const missing = [...unionKeys].filter((k) => !keys.has(k));
    if (missing.length) {
      results.push({ file, missing });
    }
  }

  return { dir, parseErrors, results, fileCount: files.length, unionSize: unionKeys.size };
}

function main() {
  let hasDrift = false;

  const targets = discoverTargets();
  console.log(`Discovered ${targets.length} i18n directories: ${targets.map((d) => path.relative(REPO_ROOT, d)).join(', ')}`);

  for (const dir of targets) {
    const report = checkDir(dir);
    console.log(`\n=== ${path.relative(REPO_ROOT, report.dir)} (${report.fileCount} files, ${report.unionSize} keys in union) ===`);

    if (report.parseErrors.length) {
      hasDrift = true;
      for (const e of report.parseErrors) {
        console.log(`  ${e.file}: PARSE ERROR — ${e.message}`);
      }
    }

    if (report.results.length === 0 && report.parseErrors.length === 0) {
      console.log('  OK — no drift, all files valid JSON');
      continue;
    }

    for (const r of report.results) {
      hasDrift = true;
      console.log(`  ${r.file}:`);
      console.log(`    missing (${r.missing.length}): ${r.missing.join(', ')}`);
    }
  }

  console.log();
  if (hasDrift) {
    console.log('i18n key drift detected.');
    process.exit(1);
  } else {
    console.log('All i18n directories in sync — every key present in every locale, all files valid JSON.');
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { flatten, checkDir, findLangDirs, discoverTargets };

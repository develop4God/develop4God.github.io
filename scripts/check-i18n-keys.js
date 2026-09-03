#!/usr/bin/env node
// Validates every locale JSON file in a given i18n directory: each file must
// parse as valid JSON, and every file's key set must exactly match the union
// of keys across ALL locale files in that directory (not just diff against
// one canonical locale — a key present in any locale must be present in
// every locale, and nothing should be missing from all but one).
// Usage: node scripts/check-i18n-keys.js

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

const TARGETS = [
  path.join(REPO_ROOT, 'lang', 'home'),
  path.join(REPO_ROOT, 'devocionales', 'lang'),
  path.join(REPO_ROOT, 'habitus', 'lang'),
  path.join(REPO_ROOT, 'work-with-me', 'lang'),
];

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

  for (const dir of TARGETS) {
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

module.exports = { flatten, checkDir };

#!/usr/bin/env node
// Validates that every locale JSON file in a given i18n directory has the
// same set of keys as a canonical locale. Flags missing and extra keys.
// Usage: node scripts/check-i18n-keys.js

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

const TARGETS = [
  { dir: path.join(REPO_ROOT, 'lang', 'home'), canonical: 'en' },
  { dir: path.join(REPO_ROOT, 'devocionales', 'lang'), canonical: 'en' },
  { dir: path.join(REPO_ROOT, 'habitus', 'lang'), canonical: 'en' },
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

function checkDir({ dir, canonical }) {
  const canonicalPath = path.join(dir, `${canonical}.json`);
  if (!fs.existsSync(canonicalPath)) {
    return { dir, error: `canonical locale "${canonical}" not found at ${canonicalPath}` };
  }

  const canonicalData = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  const canonicalKeys = new Set(flatten(canonicalData));

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== `${canonical}.json`);

  const results = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      results.push({ file, parseError: err.message });
      continue;
    }
    const keys = new Set(flatten(data));
    const missing = [...canonicalKeys].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !canonicalKeys.has(k));
    if (missing.length || extra.length) {
      results.push({ file, missing, extra });
    }
  }

  return { dir, canonical, results };
}

function main() {
  let hasDrift = false;

  for (const target of TARGETS) {
    const report = checkDir(target);
    console.log(`\n=== ${path.relative(REPO_ROOT, report.dir)} (canonical: ${report.canonical}) ===`);

    if (report.error) {
      console.log(`  ERROR: ${report.error}`);
      hasDrift = true;
      continue;
    }

    if (report.results.length === 0) {
      console.log('  OK — no drift');
      continue;
    }

    for (const r of report.results) {
      hasDrift = true;
      if (r.parseError) {
        console.log(`  ${r.file}: PARSE ERROR — ${r.parseError}`);
        continue;
      }
      console.log(`  ${r.file}:`);
      if (r.missing.length) {
        console.log(`    missing (${r.missing.length}): ${r.missing.join(', ')}`);
      }
      if (r.extra.length) {
        console.log(`    extra (${r.extra.length}): ${r.extra.join(', ')}`);
      }
    }
  }

  console.log();
  if (hasDrift) {
    console.log('i18n key drift detected.');
    process.exit(1);
  } else {
    console.log('All i18n directories in sync.');
    process.exit(0);
  }
}

main();

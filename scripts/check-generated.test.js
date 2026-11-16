'use strict';

// scripts/check-generated.sh is the one "generated files are up to date" check that CI and
// validator.py both run. These tests cover the paths that must stop before any rebuild: they run a
// copy of the script in a throwaway repo, so no real build runs and the real checkout is untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'check-generated.sh');

function tempRepo({ git = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-generated-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(SCRIPT, path.join(dir, 'scripts', 'check-generated.sh'));
  fs.mkdirSync(path.join(dir, 'devocionales'));
  fs.writeFileSync(path.join(dir, 'devocionales', 'sw.js'), 'committed\n');
  if (git) {
    const run = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    run('init', '-q');
    run('add', '.');
    run('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  }
  return dir;
}

function check(dir) {
  return spawnSync('bash', [path.join(dir, 'scripts', 'check-generated.sh')], { cwd: dir, encoding: 'utf8' });
}

test('check-generated: refuses to rebuild over uncommitted edits to a generated file, and leaves them intact', () => {
  const dir = tempRepo();
  fs.writeFileSync(path.join(dir, 'devocionales', 'sw.js'), 'my unsaved edit\n');
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /uncommitted changes/i);
  assert.match(result.stdout + result.stderr, /devocionales\/sw\.js/);
  assert.equal(fs.readFileSync(path.join(dir, 'devocionales', 'sw.js'), 'utf8'), 'my unsaved edit\n');
});

test('check-generated: fails instead of passing when git cannot read the work tree', () => {
  const dir = tempRepo({ git: false });
  const result = check(dir);
  assert.notEqual(result.status, 0);
  // It stops at git, before any build script runs (none exist in this throwaway repo).
  assert.match(result.stderr, /not a git repository/i);
  assert.doesNotMatch(result.stderr, /build-tailwind/);
});

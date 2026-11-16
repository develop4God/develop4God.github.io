'use strict';

// Phase 1 of scripts/validator.py (node --check over tracked .js files), run against throwaway git
// repos through python. Only git and node are needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const VALIDATOR = path.join(__dirname, 'validator.py');
// Hooks export GIT_DIR and friends; strip them so git only sees the throwaway repo.
const CLEAN_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(dir, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8', env: CLEAN_ENV });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
}

function repoWith(t, files) {
  const dir = tempDir(t);
  git(dir, 'init', '-q');
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  git(dir, 'add', '.');
  return dir;
}

// Runs phase_node_check(root) and returns everything it printed, ending with "RESULT <ok> <msg>".
function nodeCheck(root) {
  const code = `
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location('validator', ${JSON.stringify(VALIDATOR)})
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
ok, msg = mod.phase_node_check(pathlib.Path(sys.argv[1]))
print('RESULT', ok, msg)
`;
  const result = spawnSync('python3', ['-I', '-c', code, root], {
    encoding: 'utf8',
    env: { ...CLEAN_ENV, GIT_CEILING_DIRECTORIES: path.dirname(root) }, // never find a repo above a temp dir
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('phase 1: a syntax error in a tracked file fails the phase', (t) => {
  const dir = repoWith(t, { 'ok.js': 'let a = 1;\n', 'bad.js': 'let = ;\n' });
  const out = nodeCheck(dir);
  assert.match(out, /RESULT False/);
  assert.match(out, /bad\.js/);
});

test('phase 1: a failing git ls-files fails the phase instead of reporting no files', (t) => {
  const out = nodeCheck(tempDir(t)); // not a git repository
  assert.match(out, /RESULT False/);
});

test('phase 1: file names with spaces are checked, and files deleted from disk are skipped', (t) => {
  const dir = repoWith(t, { 'my file.js': 'let = ;\n', 'gone.js': 'let a = 1;\n' });
  fs.rmSync(path.join(dir, 'gone.js'));
  const out = nodeCheck(dir);
  assert.match(out, /RESULT False/);
  assert.match(out, /my file\.js/);
  assert.doesNotMatch(out, /gone\.js/);
});

test('phase 1: passes when every tracked file parses', (t) => {
  const dir = repoWith(t, { 'a.js': 'let a = 1;\n', 'b c.js': 'let b = 2;\n' });
  assert.match(nodeCheck(dir), /RESULT True/);
});

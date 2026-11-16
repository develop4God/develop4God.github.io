'use strict';

// scripts/check-generated.sh is the one "generated files are up to date" check that CI and
// validator.py both run. These tests run the real script in a throwaway repo whose three build
// scripts are stubs with the same contract as the real ones (the Tailwind build writes to the path
// it is given; the other two exit 1 under --check when their committed output differs from what
// they would generate). So no real build runs and the real checkout is never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'check-generated.sh');

// A git hook exports GIT_DIR (and friends) to the processes it starts, so inside the pre-push hook
// a plain `git init/add/commit` here would act on the real repository. Strip them so every git
// command below sees only the throwaway repo.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const CSS = 'devocionales/vendor/tailwind.css';
const SW = 'devocionales/sw.js';
const MANIFEST = 'devocionales/manifests/en.webmanifest';

// What each stub "build" generates. A stub for a --check mode compares its committed output to it.
const STUBS = {
  'scripts/build-tailwind.sh': 'printf "css\\n" > "$1"\n',
  'scripts/build-manifests.js': checkStub(MANIFEST, 'manifest\n', 'node scripts/build-manifests.js'),
  'scripts/build-sw.js': checkStub(SW, 'sw\n', 'node scripts/build-sw.js'),
};

function checkStub(file, expected, command) {
  return `const fs = require('node:fs');
if (!process.argv.includes('--check')) { fs.writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(expected)}); process.exit(0); }
const ok = fs.existsSync(${JSON.stringify(file)}) && fs.readFileSync(${JSON.stringify(file)}, 'utf8') === ${JSON.stringify(expected)};
if (!ok) { console.error('${file} out of date. Run: ${command}'); process.exit(1); }
`;
}

function write(dir, file, content) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), content);
}

function git(dir, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8', env: ENV });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
}

// A repo whose committed generated files are up to date, unless `committed` overrides one.
function tempRepo(t, { committed = {}, gitRepo = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-generated-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  write(dir, 'scripts/check-generated.sh', fs.readFileSync(SCRIPT, 'utf8'));
  for (const [file, content] of Object.entries(STUBS)) write(dir, file, content);
  const outputs = { [CSS]: 'css\n', [SW]: 'sw\n', [MANIFEST]: 'manifest\n', ...committed };
  for (const [file, content] of Object.entries(outputs)) if (content !== null) write(dir, file, content);
  if (gitRepo) {
    git(dir, 'init', '-q');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'init');
  }
  return dir;
}

function check(dir) {
  const result = spawnSync('bash', [path.join(dir, 'scripts', 'check-generated.sh')], { cwd: dir, encoding: 'utf8', env: ENV });
  return { ...result, output: result.stdout + result.stderr };
}

function status(dir) {
  return spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', env: ENV }).stdout;
}

const REBUILD = 'bash scripts/build-tailwind.sh && node scripts/build-manifests.js && node scripts/build-sw.js';

test('check-generated: passes when every committed generated file is up to date', (t) => {
  const dir = tempRepo(t);
  const result = check(dir);
  assert.equal(result.status, 0, result.output);
  assert.equal(status(dir), '');
});

test('check-generated: fails on a stale committed stylesheet and names the rebuild commands', (t) => {
  const dir = tempRepo(t, { committed: { [CSS]: 'old css\n' } });
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.output, /devocionales\/vendor\/tailwind\.css/);
  assert.ok(result.output.includes(REBUILD), result.output);
});

test('check-generated: fails on a stale committed worker or manifest', (t) => {
  for (const file of [SW, MANIFEST]) {
    const dir = tempRepo(t, { committed: { [file]: 'stale\n' } });
    const result = check(dir);
    assert.equal(result.status, 1, file);
    assert.ok(result.output.includes(REBUILD), result.output);
  }
});

test('check-generated: fails when a generated file was never committed', (t) => {
  const dir = tempRepo(t, { committed: { [SW]: null } });
  write(dir, SW, 'sw\n'); // correct, but only in the work tree
  assert.equal(check(dir).status, 1);
});

test('check-generated: checks the committed state and never writes to the work tree', (t) => {
  const dir = tempRepo(t);
  // An uncommitted edit to a generated file neither blocks the check nor gets overwritten.
  write(dir, SW, 'my unsaved edit\n');
  const result = check(dir);
  assert.equal(result.status, 0, result.output);
  assert.equal(fs.readFileSync(path.join(dir, SW), 'utf8'), 'my unsaved edit\n');
  assert.equal(status(dir), ` M ${SW}\n`);
});

test('check-generated: a stale committed file still fails even if the work tree has the fix', (t) => {
  const dir = tempRepo(t, { committed: { [CSS]: 'old css\n' } });
  write(dir, CSS, 'css\n');
  assert.equal(check(dir).status, 1);
});

test('check-generated: fails instead of passing outside a git repository', (t) => {
  const dir = tempRepo(t, { gitRepo: false });
  const result = check(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not a git repository/i);
});

'use strict';

// devocionales/vendor/tailwind.css is generated and committed, and CI fails when a rebuild differs.
// A lockfile keeps a rebuild identical over time: without it the transitive dependencies would be
// resolved afresh on every install and a new release could change the output on an unrelated PR.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, 'tailwind');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));

test('the Tailwind build declares exact versions, with no ranges', () => {
    const { dependencies } = readJson('package.json');
    assert.ok(dependencies.tailwindcss && dependencies.postcss);
    for (const [name, version] of Object.entries(dependencies)) {
        assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must be pinned exactly`);
    }
});

test('the lockfile resolves the same versions as package.json', () => {
    const { dependencies } = readJson('package.json');
    const lock = readJson('package-lock.json');
    for (const [name, version] of Object.entries(dependencies)) {
        assert.equal(lock.packages[`node_modules/${name}`].version, version, name);
    }
});

test('the lockfile pins every installed package with an integrity hash', () => {
    const lock = readJson('package-lock.json');
    const installed = Object.entries(lock.packages).filter(([key]) => key.startsWith('node_modules/'));
    assert.ok(installed.length > 20, 'expected the transitive dependencies to be locked');
    for (const [key, entry] of installed) assert.ok(entry.integrity, `${key} has no integrity hash`);
});

test('the build script installs from the lockfile', () => {
    const script = fs.readFileSync(path.join(__dirname, 'build-tailwind.sh'), 'utf8');
    assert.match(script, /npm ci/);
    assert.equal(/npm install/.test(script), false, 'npm install would ignore the lockfile');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePort, DEFAULT_PORT } = require('./e2e-port');

test('resolvePort: unset or empty E2E_PORT falls back to the CI default 8791', () => {
  assert.equal(DEFAULT_PORT, 8791);
  assert.equal(resolvePort({}), 8791);
  assert.equal(resolvePort({ E2E_PORT: '' }), 8791);
});

test('resolvePort: a valid E2E_PORT is used', () => {
  assert.equal(resolvePort({ E2E_PORT: '8899' }), 8899);
  assert.equal(resolvePort({ E2E_PORT: '1024' }), 1024);
  assert.equal(resolvePort({ E2E_PORT: '65535' }), 65535);
});

test('resolvePort: an invalid E2E_PORT throws instead of silently using another port', () => {
  for (const bad of ['abc', '88.5', '-1', '0', '1023', '65536', '8899x', ' 8899']) {
    assert.throws(() => resolvePort({ E2E_PORT: bad }), /E2E_PORT/, bad);
  }
});

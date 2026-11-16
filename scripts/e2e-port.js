'use strict';

// Port of the local static server the e2e suite runs against. CI leaves E2E_PORT unset and
// gets the default; a local run sets it to avoid colliding with another agent on 8791.
const DEFAULT_PORT = 8791;

function resolvePort(env) {
  const raw = env.E2E_PORT;
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1024 || port > 65535) {
    throw new Error(`E2E_PORT must be an integer from 1024 to 65535, got "${raw}"`);
  }
  return port;
}

module.exports = { resolvePort, DEFAULT_PORT };

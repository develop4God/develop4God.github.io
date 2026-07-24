// Playwright config for e2e/UI verification.
// Playwright itself is NOT a repo dependency (no package.json, by design —
// see CLAUDE.md / web-coding-agent skill) — install to a scratch dir before
// running, same convention as eslint/stylelint/html-validate:
//   mkdir -p /tmp/pw-tools && cd /tmp/pw-tools
//   npm install --no-save playwright @playwright/test
//   npx playwright install chromium
// Then from the repo root: /tmp/pw-tools/node_modules/.bin/playwright test -c e2e/
const { defineConfig } = require('/tmp/pw-tools/node_modules/@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 15_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8791',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 8791 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8791',
    cwd: '..',
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});

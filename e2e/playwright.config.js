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
  // Generated output goes outside the repo so eslint/stylelint/html-validate never lint it.
  outputDir: '/tmp/pw-results',
  reporter: [['list'], ['html', { outputFolder: '/tmp/pw-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8791',
    trace: 'retain-on-failure',
    // The devocionales page registers a service worker. An active worker answers requests
    // without Playwright's page.route() seeing them, which would silently break every spec that
    // mocks the network. Specs that test the worker opt in with test.use({ serviceWorkers: 'allow' }).
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium' },
    // Safari's engine, for the PWA specs only: service workers, storage and install behave
    // differently on iOS. Opt-in (E2E_WEBKIT=1, set in CI) so the local pre-push hook does not
    // need WebKit installed. Firefox is not run: Playwright's offline emulation there blocks even
    // navigations a service worker would answer, so its offline results would not be real.
    ...(process.env.E2E_WEBKIT
      ? [{
        name: 'webkit',
        testMatch: /devocionales-(pwa|shell|self-hosted-assets)\.spec\.js/,
        use: { browserName: 'webkit' },
      }]
      : []),
  ],
  webServer: {
    command: 'python3 -m http.server 8791 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8791',
    cwd: '..',
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});

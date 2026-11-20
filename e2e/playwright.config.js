// Playwright config for e2e/UI verification.
// Playwright itself is NOT a repo dependency (no package.json, by design —
// see CLAUDE.md / web-coding-agent skill) — install to a scratch dir before
// running, same convention as eslint/stylelint/html-validate:
//   mkdir -p /tmp/pw-tools && cd /tmp/pw-tools
//   npm install --no-save playwright @playwright/test
//   npx playwright install chromium
// Then from the repo root: /tmp/pw-tools/node_modules/.bin/playwright test -c e2e/
const { defineConfig, devices } = require('/tmp/pw-tools/node_modules/@playwright/test');
const { resolvePort } = require('../scripts/e2e-port');

// Set E2E_PORT to run on a private port (e.g. E2E_PORT=8899) when another run holds the default.
const PORT = resolvePort(process.env);

module.exports = defineConfig({
  testDir: '.',
  timeout: 15_000,
  fullyParallel: true,
  // Generated output goes outside the repo so eslint/stylelint/html-validate never lint it.
  outputDir: '/tmp/pw-results',
  reporter: [['list'], ['html', { outputFolder: '/tmp/pw-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    // The devocionales page registers a service worker. An active worker answers requests
    // without Playwright's page.route() seeing them, which would silently break every spec that
    // mocks the network. Specs that test the worker opt in with test.use({ serviceWorkers: 'allow' }).
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium' },
    // Safari's engine, for the PWA specs only: service workers, storage and install behave
    // differently on iOS. Opt-in (E2E_WEBKIT=1, set in CI) so a local run does not
    // need WebKit installed. Firefox is not run: Playwright's offline emulation there blocks even
    // navigations a service worker would answer, so its offline results would not be real.
    ...(process.env.E2E_WEBKIT
      ? [{
        name: 'webkit',
        testMatch: /devocionales-(pwa|shell|self-hosted-assets)\.spec\.js|discovery-(studies|detail|offline)\.spec.js|encounters\.spec\.js/,
        use: { browserName: 'webkit' },
      }]
      : []),
    // Real-device emulation for the Bible-studies page (touch, small and tablet viewports, iOS safe areas).
    // Opt-in (E2E_DEVICES=1) so the pre-push hook stays fast; iphone-13 needs WebKit installed.
    ...(process.env.E2E_DEVICES
      ? [
        { name: 'pixel-7', testMatch: /(discovery-(studies|detail|offline)|encounters)\.spec.js/, use: { ...devices['Pixel 7'] } },
        { name: 'iphone-13', testMatch: /(discovery-(studies|detail|offline)|encounters)\.spec.js/, use: { ...devices['iPhone 13'] } },
        { name: 'small-320', testMatch: /(discovery-(studies|detail|offline)|encounters)\.spec.js/, use: { viewport: { width: 320, height: 568 } } },
        { name: 'ipad', testMatch: /(discovery-(studies|detail|offline)|encounters)\.spec.js/, use: { ...devices['iPad (gen 7)'] } },
      ]
      : []),
  ],
  webServer: {
    command: `python3 scripts/e2e-server.py ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    cwd: '..',
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});

# e2e tests

Browser-driven checks using [Playwright](https://playwright.dev). Not a repo
dependency — this repo has zero `npm install`s by design (see root
`CLAUDE.md` / `.claude/skills/web-coding-agent/SKILL.md`). Install to a
scratch dir once per machine/session:

```bash
mkdir -p /tmp/pw-tools && cd /tmp/pw-tools
npm install --no-save playwright @playwright/test
npx playwright install chromium
```

Run from the repo root:

```bash
/tmp/pw-tools/node_modules/.bin/playwright test -c e2e/
```

The config's `webServer` block starts `python3 -m http.server 8791` for you
and waits for it to be ready — no manual server/Chrome process management,
no port-collision cleanup needed between runs.

## Adding a new spec

One file per page/flow, e.g. `habitus-reader.spec.js`. Follow
`devocionales-reader.spec.js` as the template: assert on real content
(text that changed), real interactions (a click that should do something),
and always assert `consoleErrors` is empty.

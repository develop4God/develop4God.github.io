// Replay across a deploy for the Encounters list header (hero, chips, progress bars). The HTML is
// revalidated on every visit but scripts are cached for hours, so a visitor can hold the previous page
// with the new scripts. The previous page is derived from the current one by removing what this change
// added, so no copy of old files is kept. Older cached scripts against the new page are covered by the
// unit tests that inject no header or no bar builder.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const PAGE = '/devocionales/encounters/';
const CURRENT_HTML = fs.readFileSync(path.join(__dirname, '..', 'devocionales', 'encounters', 'index.html'), 'utf8');
const ADDED_SCRIPTS = ['discovery-progress.js', 'discovery-hero-dom.js', 'encounter-filters.js'];
const IMAGES = /raw\.githubusercontent\.com\/develop4God\/Devocionales-assets\/.*\/images\/encounters\//;
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const INDEX = {
    encounters: [{ id: 'a', version: '1', status: 'published', emoji: '🌊', files: { en: 'a_en.json' }, titles: { en: 'Title a' }, subtitles: { en: 'Sub a' }, scripture_reference: { en: 'Matthew 14:22-33' }, estimated_reading_minutes: { en: 5 } }],
};

// The page as it was before the header: no hero or chips containers and none of the new scripts.
function previousHtml() {
    let html = CURRENT_HTML
        .replace('<div id="encounters-hero"></div>\n', '')
        .replace('<div id="encounters-chips" class="studies-chips-bar"></div>\n', '');
    for (const script of ADDED_SCRIPTS) html = html.replace(new RegExp(`\\s*<script src="/devocionales/js/${script.replace('.', '\\.')}"></script>`), '');
    return html;
}

async function arrange(page) {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(/encounters\/index\.json/, (route) => route.fulfill({ json: INDEX }));
    await page.route(IMAGES, (route) => route.fulfill({ contentType: 'image/png', body: PNG_1X1 }));
    await page.addInitScript(() => { try { localStorage.setItem('develop4God_encounters_welcome_seen', 'true'); } catch (_) { /* storage blocked */ } });
    return errors;
}

test('the derived previous HTML really lacks the header containers and the new scripts', () => {
    const html = previousHtml();
    for (const marker of ['encounters-hero', 'encounters-chips', ...ADDED_SCRIPTS]) {
        expect(CURRENT_HTML).toContain(marker);
        expect(html).not.toContain(marker);
    }
});

test('the previous Encounters HTML with the new scripts renders the plain list without errors', async ({ page }) => {
    const errors = await arrange(page);
    await page.route(/\/devocionales\/encounters\/(index\.html)?(\?.*)?$/, (route) => route.fulfill({ contentType: 'text/html', body: previousHtml() }));
    await page.goto(PAGE);
    await expect(page.locator('.encounter-card[data-encounter-id="a"]')).toBeVisible();
    await expect(page.locator('.study-hero, .study-chips')).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('the empty chips band left by an older cached script takes no space', async ({ page }) => {
    await arrange(page);
    await page.route(/\/devocionales\/js\/encounter-boot\.js/, (route) => route.fulfill({ contentType: 'text/javascript', body: '/* an older script that never fills the chips */' }));
    await page.goto(PAGE);
    await expect(page.locator('#encounters-chips')).toBeHidden();
});

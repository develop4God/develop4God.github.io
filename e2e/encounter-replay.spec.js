// Replay across a deploy on the Encounters reader: a returning user's cached encounter-reader-dom.js
// (the previous deploy) runs against the new CSS. Its nav and footer classes (encounter-exit,
// encounter-complete) must still be styled, so the reader stays usable until the cache expires.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('/tmp/pw-tools/node_modules/@playwright/test');

const PAGE = '/devocionales/encounters/';
const INDEX_URL = /raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/encounters\/index\.json/;
const FILE_URL = /raw\.githubusercontent\.com\/develop4God\/Devocionales-json\/.*\/encounters\/(en\/)?a_en\.json/;
const IMAGES = /raw\.githubusercontent\.com\/develop4God\/Devocionales-assets\/.*\/images\/encounters\//;
const DOM_URL = /\/devocionales\/js\/encounter-reader-dom\.js/;
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const OLD_DOM = fs.readFileSync(path.join(__dirname, 'fixtures', 'previous-deploy', 'encounter-reader-dom.js.txt'), 'utf8');

const INDEX = {
    encounters: [{
        id: 'a', version: '1', status: 'published', emoji: '🌊', accent_color: '#1e3a5f', intro_image: 'a_intro.png',
        files: { en: 'a_en.json' }, titles: { en: 'Title a' }, subtitles: { en: 'Sub a' },
        scripture_reference: { en: 'Matthew 14:22-33' }, estimated_reading_minutes: { en: 5 },
    }],
};
const ENCOUNTER = {
    id: 'a',
    bible_version: 'KJ2000',
    key_verse: { reference: 'Mark 10:46', text: 'And they came to Jericho', bible_version: 'KJ2000' },
    cards: [
        { order: 1, type: 'cinematic_scene', title: 'The road', narrative: 'They walked.' },
        { order: 2, type: 'completion', completion_verse: { reference: 'Mark 10:52', text: 'Go thy way' } },
    ],
};

test('previous cached reader script against the new CSS keeps its nav and completion button styled', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(INDEX_URL, (route) => route.fulfill({ json: INDEX }));
    await page.route(FILE_URL, (route) => route.fulfill({ json: ENCOUNTER }));
    await page.route(IMAGES, (route) => route.fulfill({ contentType: 'image/png', body: PNG_1X1 }));
    await page.route(DOM_URL, (route) => route.fulfill({ contentType: 'text/javascript', body: OLD_DOM }));
    await page.addInitScript(() => {
        try {
            localStorage.setItem('develop4God_language', 'en');
            localStorage.setItem('develop4God_encounters_welcome_seen', 'true');
        } catch (_) { /* storage blocked */ }
    });
    await page.goto(PAGE);
    await page.locator('.encounter-card[data-encounter-id="a"]').click();
    await page.locator('.encounter-intro-enter').click();
    // The previous script renders its own nav classes, not the new reader-* ones.
    await page.locator('.encounter-next').click();
    await page.locator('.encounter-next').click();
    const complete = page.locator('.encounter-complete');
    await expect(complete).toHaveText('ENCOUNTER COMPLETE');
    // Styled, not browser-default: the old button keeps the accent background and a real height.
    const style = await complete.evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        height: el.getBoundingClientRect().height,
    }));
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.height).toBeGreaterThan(30);
    await complete.click();
    await expect(complete).toBeDisabled();
    expect(errors).toEqual([]);
});

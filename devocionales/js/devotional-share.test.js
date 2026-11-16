const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const win = {};
    const filename = path.join(__dirname, 'devotional-share.js');
    const source = fs.readFileSync(filename, 'utf8');
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalShare;
}

const { buildShareText } = loadModule();

const entry = { versiculo: 'John 3:16', reflexion: 'Reflection body', oracion: 'Prayer body' };
const labels = {
    eyebrow: 'Daily Devotional',
    versiculo: 'Verse',
    reflexion: 'Reflection',
    oracion: 'Prayer',
    readMore: 'More devotional content here',
    footerDownload: 'Download: Christian Devotionals',
    footerBenefits: '100% free | No ads | Offline use',
    footerDeveloper: 'Develop4God',
};
const url = 'https://develop4god.com/devocionales/?date=2026-11-16';

test('includes the devotional sections, the link and the download footer on Android', () => {
    const text = buildShareText(entry, labels, url, { includeAppFooter: true });
    for (const part of [
        '📖 *Daily Devotional*', '✝️ *Verse:*', 'John 3:16', '💭 *Reflection:*', 'Reflection body',
        '🕊️ *Prayer:*', 'Prayer body', 'More devotional content here:', url,
        '📲 *Download: Christian Devotionals*', '100% free | No ads | Offline use',
        'https://play.google.com/store/apps/details?id=com.develop4god.devocional_nuevo', 'Develop4God',
    ]) {
        assert.ok(text.includes(part), `missing: ${part}`);
    }
});

test('does not include the "just the beginning" feature-list block', () => {
    const fomoLabels = {
        ...labels,
        footerTitle: 'This is just the beginning...',
        footerCompleteApp: 'The complete app includes:',
        footerDailyDevotionals: 'Updated daily devotionals',
        footerAudioReading: 'Audio reading',
        footerBibleStudies: 'Bible studies',
        footerBibleVersions: 'Bible versions',
        footerAndMore: 'And much more...',
    };
    const text = buildShareText(entry, fomoLabels, url, { includeAppFooter: true });
    assert.ok(!text.includes('just the beginning'));
    assert.ok(!text.includes('The complete app includes'));
    assert.ok(!text.includes('✓'));
    assert.ok(!text.includes('🔥'));
});

test('keeps the download footer after the divider, in order', () => {
    const lines = buildShareText(entry, labels, url, { includeAppFooter: true }).split('\n');
    const divider = lines.indexOf('━━━━━━━━━━━━━━━━');
    assert.ok(divider > 0);
    assert.equal(lines[divider + 1], '📲 *Download: Christian Devotionals*');
    assert.equal(lines[lines.length - 1], 'Develop4God');
});

test('omits the whole download footer (divider, Play Store link) when not on Android', () => {
    for (const options of [undefined, {}, { includeAppFooter: false }]) {
        const text = buildShareText(entry, labels, url, options);
        assert.ok(!text.includes('play.google.com'));
        assert.ok(!text.includes('━'));
        assert.ok(!text.includes('Download: Christian Devotionals'));
        assert.ok(!text.includes('Develop4God'));
        assert.ok(text.endsWith(url), 'message ends with the read-more link');
        assert.ok(text.includes('Prayer body'));
    }
});

test('PLAY_STORE_URL is exported so other share builders reuse the same link', () => {
    assert.match(loadModule().PLAY_STORE_URL, /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.develop4god\.devocional_nuevo/);
});

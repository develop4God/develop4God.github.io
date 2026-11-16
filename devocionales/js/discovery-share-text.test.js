'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const name of ['discovery-cards.js', 'discovery-share-text.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { buildStudyShareText, extractKeyPoints } = global.window.DiscoveryShareText;

const labels = {
    eyebrow: 'DAILY BIBLE STUDY', revelation: 'Revelation', reflectionQuestions: 'Reflection Questions',
    footerDownload: 'Download: Christian Devotionals', footerBenefits: '100% free | No ads | Offline use', footerDeveloper: 'Develop4God',
};
const URL = 'https://play.example/app';
const study = (over = {}) => ({
    emoji: '🧎',
    subtitle: 'What Jesus did',
    key_verse: { reference: 'John 13:1', text: 'He loved them unto the end.' },
    cards: [
        { order: 1, type: 'cultural_context', icon: '🍽️', title: 'The place at the table', content: 'Intro line\n• one\n• two\n• three\n• four', revelation_key: 'Love first.' },
        { order: 2, type: 'discovery_activation', title: 'Personal', discovery_questions: [{ question: 'What do you surrender?' }, { question: 'second' }] },
    ],
    ...over,
});

// Mirrors devocional_nuevo/lib/utils/discovery_share_helper.dart `_generarResumen`.
test('summary has the same structure as the app share text', () => {
    const text = buildStudyShareText(study(), labels, URL);
    assert.equal(text, [
        '🧎 *DAILY BIBLE STUDY*',
        '_What Jesus did_',
        '',
        '📖 *John 13:1*',
        '"He loved them unto the end."',
        '',
        '🍽️ *The place at the table*',
        '• one\n• two\n• three',
        '',
        '💡 *Revelation:*',
        'Love first.',
        '',
        '❓ *Reflection Questions:*',
        'What do you surrender?',
        '',
        '━━━━━━━━━━━━━━━━',
        '📲 *Download: Christian Devotionals*',
        '100% free | No ads | Offline use',
        URL,
        'Develop4God',
    ].join('\n'));
});

test('defaults: emoji 📖 and card icon 📝 when missing', () => {
    const s = study({ emoji: undefined });
    delete s.cards[0].icon;
    const text = buildStudyShareText(s, labels, URL);
    assert.ok(text.startsWith('📖 *DAILY BIBLE STUDY*'));
    assert.ok(text.includes('📝 *The place at the table*'));
});

test('omits subtitle, key verse, revelation and question when absent', () => {
    const s = study({ subtitle: '', key_verse: undefined });
    delete s.cards[0].revelation_key;
    s.cards[1].discovery_questions = [];
    const text = buildStudyShareText(s, labels, URL);
    assert.ok(!text.includes('_'));
    assert.ok(!text.includes('📖 *John'));
    assert.ok(!text.includes('💡'));
    assert.ok(!text.includes('❓'));
    assert.ok(text.includes('━━━━━━━━━━━━━━━━'));
});

test('without an activation card, the last card supplies the question', () => {
    const s = study();
    s.cards[1].type = 'other';
    assert.ok(buildStudyShareText(s, labels, URL).includes('What do you surrender?'));
});

test('no cards still yields the header, verse and footer (never throws, never empty)', () => {
    const text = buildStudyShareText(study({ cards: [] }), labels, URL);
    assert.ok(text.includes('📖 *John 13:1*'));
    assert.ok(text.endsWith('Develop4God'));
    assert.ok(buildStudyShareText({}, labels, URL).length > 0);
    assert.ok(buildStudyShareText(null, labels, URL).includes(URL));
});

test('cards are taken in `order`, not array position', () => {
    const s = study();
    s.cards = [s.cards[1], s.cards[0]];
    assert.ok(buildStudyShareText(s, labels, URL).includes('The place at the table'));
});

test('extractKeyPoints: bullets first (max 3), else the first two lines', () => {
    assert.equal(extractKeyPoints('a\n• b\n• c\n• d\n• e'), '• b\n• c\n• d');
    assert.equal(extractKeyPoints('first\nsecond\nthird'), 'first\nsecond');
    assert.equal(extractKeyPoints('\n\n'), '');
    assert.equal(extractKeyPoints('1️⃣ step\nplain\n💔 hurt'), '1️⃣ step\n💔 hurt');
    assert.equal(extractKeyPoints('plain text here\n- a dash item longer'), '- a dash item longer');
});

test('an `order` of 0 is a real position, not "missing"', () => {
    const s = study();
    s.cards = [
        { order: 1, type: 'x', title: 'Second' },
        { order: 0, type: 'x', title: 'Zero first' },
    ];
    assert.ok(buildStudyShareText(s, labels, URL).includes('*Zero first*'));
});

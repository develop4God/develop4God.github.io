'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'ui-pager-dots.js', 'discovery-cards.js', 'key-verse-card.js', 'discovery-detail-dom.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const W = global.window;
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../e2e/fixtures/discovery', name), 'utf8'));

const LABELS = {
    keyVerse: 'KEY VERSE', revelation: 'Revelation', meaning: 'Meaning', strongNumber: "Strong's Number", reference: 'Reference',
    application: 'Application', reflectionQuestions: 'Reflection Questions', activationPrayer: 'Closing prayer',
    pageOf: 'Page {current} of {total}', swipeHint: 'Swipe to continue', previous: 'Previous', next: 'Next', exit: 'Exit', markCompleted: 'Complete study', completedStudy: 'Study completed',
    studyNotFound: 'Study not found.', title: 'Bible Studies',
};
const t = (k) => LABELS[k] || k;
const doc = new FakeDocument();
const dom = W.DiscoveryDetailDom.createDetailDom({ h: W.DomBuilder.createBuilder(doc), t });
const noop = () => {};
const pageOf = (study, i) => W.DiscoveryCards.buildPages(study)[i];

test('key verse page: label, verse text and reference (C1)', () => {
    const study = fixture('ascension_victory_en_001.json');
    const el = dom.buildPage(pageOf(study, 0));
    assert.equal(el.querySelector('.key-verse-card-label').textContent, 'KEY VERSE');
    assert.equal(el.querySelector('.key-verse-card-text').textContent, study.key_verse.text);
    assert.equal(el.querySelector('.key-verse-card-ref').textContent, study.key_verse.reference);
});

test('card page: icon, title, subtitle and content with line breaks kept (C3)', () => {
    const study = fixture('ascension_victory_en_001.json');
    const first = pageOf(study, 1);
    const el = dom.buildPage(first);
    assert.equal(el.querySelector('.study-page-title').textContent, first.card.title);
    assert.equal(el.querySelector('.study-page-icon').textContent, first.card.icon);
    if (first.card.content) assert.equal(el.querySelector('.study-page-content').textContent, first.card.content);
});

test('content: **bold** and *italic* become strong / em elements, never raw HTML (C3, E0)', () => {
    const el = dom.buildPage({ kind: 'card', card: { title: 'T', content: 'a **b** c *d* <img src=x onerror=alert(1)>' }, isLast: false });
    const content = el.querySelector('.study-page-content');
    assert.equal(content.querySelectorAll('strong').length, 1);
    assert.equal(content.querySelector('strong').textContent, 'b');
    assert.equal(content.querySelector('em').textContent, 'd');
    assert.equal(content.querySelectorAll('img').length, 0);
    assert.ok(content.textContent.includes('<img src=x onerror=alert(1)>'));
});

test('real study: Greek word tiles show word, transliteration, strong, meaning, revelation (+ reference / application when present)', () => {
    const study = fixture('ascension_victory_en_001.json');
    const page = W.DiscoveryCards.buildPages(study).find((p) => p.kind === 'card' && p.card.greek_words);
    const el = dom.buildPage(page);
    const tiles = el.querySelectorAll('.study-word');
    assert.equal(tiles.length, page.card.greek_words.length);
    const w = page.card.greek_words[0];
    assert.equal(tiles[0].querySelector('.study-word-term').textContent, w.word);
    assert.ok(tiles[0].textContent.includes(`(${w.transliteration})`));
    assert.ok(tiles[0].textContent.includes(`Meaning: ${w.meaning}`));
    assert.ok(tiles[0].textContent.includes(`Revelation: ${w.revelation}`));
    if (w.strong) assert.ok(tiles[0].textContent.includes(w.strong));
});

test('real study: Hebrew words use the same tiles', () => {
    const study = fixture('balaam_humble_vision_en_001.json');
    const page = W.DiscoveryCards.buildPages(study).find((p) => p.kind === 'card' && p.card.hebrew_words);
    const el = dom.buildPage(page);
    assert.equal(el.querySelectorAll('.study-word').length, page.card.hebrew_words.length);
    assert.equal(el.querySelector('.study-word-term').textContent, page.card.hebrew_words[0].word);
});

test('word tiles omit reference/application when empty or missing', () => {
    const el = dom.buildPage({ kind: 'card', card: { title: 'T', greek_words: [{ word: 'λόγος', transliteration: 'logos', meaning: 'm', revelation: 'r', reference: '', application: undefined }] }, isLast: false });
    assert.ok(!el.textContent.includes('Reference:'));
    assert.ok(!el.textContent.includes('Application:'));
});

test('real study: scripture connections / references render reference + text', () => {
    const study = fixture('ascension_victory_en_001.json');
    const page = W.DiscoveryCards.buildPages(study).find((p) => p.kind === 'card' && (p.card.scripture_connections || p.card.scripture_references));
    const el = dom.buildPage(page);
    const list = page.card.scripture_connections || page.card.scripture_references;
    const verses = el.querySelectorAll('.study-verse');
    assert.equal(verses.length, list.length);
    assert.equal(verses[0].querySelector('.study-verse-ref').textContent, list[0].reference);
    assert.equal(verses[0].querySelector('.study-verse-text').textContent, list[0].text);
});

test('real study: scripture anchor, revelation key and identity statement render when present', () => {
    const study = fixture('ascension_victory_en_001.json');
    const page = W.DiscoveryCards.buildPages(study).find((p) => p.kind === 'card' && p.card.scripture_anchor);
    const el = dom.buildPage(page);
    assert.equal(el.querySelector('.study-anchor-ref').textContent, page.card.scripture_anchor.reference);
    const withRev = W.DiscoveryCards.buildPages(study).find((p) => p.kind === 'card' && p.card.revelation_key);
    assert.ok(dom.buildPage(withRev).querySelector('.study-revelation').textContent.includes(withRev.card.revelation_key));
    const identity = dom.buildPage({ kind: 'card', card: { title: 'T', identity_statement: 'I am loved' }, isLast: false });
    assert.equal(identity.querySelector('.study-identity').textContent, 'I am loved');
});

test('real study: discovery questions (with header) and prayer render on the activation card', () => {
    const study = fixture('ascension_victory_en_001.json');
    const page = W.DiscoveryCards.buildPages(study).find((p) => p.kind === 'card' && p.card.discovery_questions);
    const el = dom.buildPage(page);
    assert.equal(el.querySelector('.study-questions-title').textContent, 'Reflection Questions');
    const qs = el.querySelectorAll('.study-question');
    assert.equal(qs.length, page.card.discovery_questions.length);
    assert.equal(qs[0].querySelector('.study-question-text').textContent, page.card.discovery_questions[0].question);
    assert.equal(el.querySelector('.study-prayer-title').textContent, 'Closing prayer');
    assert.equal(el.querySelector('.study-prayer-text').textContent, page.card.prayer.content);
});

test('real study: action steps and timeline entries render', () => {
    const balaam = fixture('balaam_humble_vision_en_001.json');
    const steps = W.DiscoveryCards.buildPages(balaam).find((p) => p.kind === 'card' && p.card.action_steps);
    const stepsEl = dom.buildPage(steps);
    assert.equal(stepsEl.querySelectorAll('.study-step').length, steps.card.action_steps.length);
    assert.ok(stepsEl.textContent.includes(steps.card.action_steps[0].title));
    const lamb = fixture('lamb_of_god_en_001.json');
    const tl = W.DiscoveryCards.buildPages(lamb).find((p) => p.kind === 'card' && p.card.timeline);
    const tlEl = dom.buildPage(tl);
    assert.equal(tlEl.querySelectorAll('.study-timeline-item').length, tl.card.timeline.length);
    assert.ok(tlEl.textContent.includes(tl.card.timeline[0].event));
});

test('every card of every real fixture renders without throwing and shows its title', () => {
    for (const name of fs.readdirSync(path.join(__dirname, '../../e2e/fixtures/discovery'))) {
        const study = fixture(name);
        for (const page of W.DiscoveryCards.buildPages(study)) {
            const el = dom.buildPage(page);
            assert.ok(el.textContent.length > 0, `${name} page`);
            if (page.kind === 'card') assert.equal(el.querySelector('.study-page-title').textContent, page.card.title, name);
        }
    }
});

test('unknown card type with only common fields still renders (≈55 types exist)', () => {
    const el = dom.buildPage({ kind: 'card', card: { type: 'brand_new_type', icon: '🆕', title: 'Fresh', subtitle: 'Sub', content: 'Body' }, isLast: false });
    assert.equal(el.querySelector('.study-page-title').textContent, 'Fresh');
    assert.equal(el.querySelector('.study-page-subtitle').textContent, 'Sub');
    assert.equal(el.querySelector('.study-page-content').textContent, 'Body');
});

test('malformed optional fields (wrong types, nulls, empty arrays) are skipped, not thrown on', () => {
    const card = { title: 'T', greek_words: 'x', scripture_connections: [null, 5, { reference: 'R' }], discovery_questions: [{}], prayer: 'nope', action_steps: [null], timeline: {}, scripture_anchor: 'x' };
    assert.doesNotThrow(() => dom.buildPage({ kind: 'card', card, isLast: false }));
});

test('E0: remote strings in every field are text, never markup', () => {
    const p = '<img src=x onerror=alert(1)>';
    const card = { icon: p, title: p, subtitle: p, content: p, revelation_key: p, identity_statement: p, scripture_anchor: { reference: p, text: p },
        scripture_connections: [{ reference: p, text: p }], greek_words: [{ word: p, transliteration: p, meaning: p, revelation: p, strong: p }],
        discovery_questions: [{ category: p, question: p }], prayer: { title: p, content: p }, action_steps: [{ title: p, description: p }], timeline: [{ event: p, description: p, revelation: p }] };
    const el = dom.buildPage({ kind: 'card', card, isLast: false });
    assert.equal(el.querySelectorAll('img').length, 0);
    assert.ok(el.textContent.includes(p));
});

// ---- chrome around the pages ----

test('progress: tappable segments, the current one marked, earlier ones filled (C1)', () => {
    const picked = [];
    const el = dom.buildProgress(5, 2, 'Love', { onSelect: (i) => picked.push(i) });
    const segs = el.querySelectorAll('.pager-dot');
    assert.equal(segs.length, 5);
    assert.deepEqual(segs.map((s) => s.classList.contains('is-done')), [true, true, true, false, false]);
    assert.deepEqual(segs.map((s) => s.classList.contains('is-current')), [false, false, true, false, false]);
    assert.equal(el.getAttribute('role'), 'group');
    assert.equal(el.getAttribute('aria-label'), 'Love');
    assert.deepEqual(segs.map((s) => s.tagName), Array(5).fill('BUTTON'));
    assert.equal(segs[2].getAttribute('aria-current'), 'step');
    assert.equal(segs[0].getAttribute('aria-current'), null);
    assert.equal(segs[0].getAttribute('aria-label'), 'Page 1 of 5');
    segs[4].click();
    segs[0].click();
    assert.deepEqual(picked, [4, 0]);
});

test('progress: without a handler the segments are inert, not broken', () => {
    const el = dom.buildProgress(3, 0, 'Love');
    assert.doesNotThrow(() => el.querySelectorAll('.pager-dot')[1].click());
});

test('swipe hint: a short text with a decorative chevron', () => {
    const el = dom.buildSwipeHint();
    assert.equal(el.textContent, 'Swipe to continue');
    assert.equal(el.querySelector('.study-swipe-chevron').getAttribute('aria-hidden'), 'true');
});

test('nav: Previous disabled on the first page; Next on middle pages; Exit on the last (C2)', () => {
    const calls = [];
    const handlers = { onPrev: () => calls.push('prev'), onNext: () => calls.push('next'), onExit: () => calls.push('exit') };
    const first = dom.buildNav({ index: 0, total: 3, ...handlers });
    assert.equal(first.querySelector('.study-prev').hasAttribute('disabled'), true);
    first.querySelector('.study-next').click();
    const middle = dom.buildNav({ index: 1, total: 3, ...handlers });
    assert.equal(middle.querySelector('.study-prev').hasAttribute('disabled'), false);
    middle.querySelector('.study-prev').click();
    const last = dom.buildNav({ index: 2, total: 3, ...handlers });
    assert.equal(last.querySelector('.study-next'), null);
    last.querySelector('.study-exit').click();
    assert.deepEqual(calls, ['next', 'prev', 'exit']);
});

test('nav: a one-page study shows only Exit', () => {
    const el = dom.buildNav({ index: 0, total: 1, onPrev: noop, onNext: noop, onExit: noop });
    assert.equal(el.querySelector('.study-next'), null);
    assert.ok(el.querySelector('.study-exit'));
});

test('footer (last page): Mark as completed calls back; completed shows a disabled "Study completed" (C4)', () => {
    let done = 0;
    const open = dom.buildFooter({ isCompleted: false, copyright: 'Public Domain.', onComplete: () => { done += 1; } });
    open.querySelector('.study-complete').click();
    assert.equal(done, 1);
    assert.equal(open.querySelector('.study-complete').textContent, 'Complete study');
    const finished = dom.buildFooter({ isCompleted: true, copyright: 'x', onComplete: () => { done += 1; } });
    assert.equal(finished.querySelector('.study-complete').textContent, 'Study completed');
    assert.equal(finished.querySelector('.study-complete').hasAttribute('disabled'), true);
});

test('footer: a completed button carries a decorative check, an open one does not', () => {
    const finished = dom.buildFooter({ isCompleted: true, copyright: '', onComplete: noop }).querySelector('.study-complete');
    const check = finished.querySelector('.study-complete-check');
    assert.ok(check);
    assert.equal(check.getAttribute('aria-hidden'), 'true');
    assert.equal(finished.textContent, 'Study completed', 'the check adds no text for screen readers');
    assert.equal(dom.buildFooter({ isCompleted: false, copyright: '', onComplete: noop }).querySelector('.study-complete-check'), null);
});

test('footer: shows the copyright line (C5) and omits it when empty', () => {
    assert.equal(dom.buildFooter({ isCompleted: false, copyright: 'KJV text', onComplete: noop }).querySelector('.study-copyright').textContent, 'KJV text');
    assert.equal(dom.buildFooter({ isCompleted: false, copyright: '', onComplete: noop }).querySelector('.study-copyright'), null);
});

test('header: emoji, title and subtitle of the study', () => {
    const el = dom.buildHeader({ emoji: '🧎', title: 'Love', subtitle: 'Sub' });
    assert.equal(el.querySelector('.study-detail-title').textContent, 'Love');
    assert.equal(el.querySelector('.study-detail-subtitle').textContent, 'Sub');
});

test('not found: message and a link back to the list (C6)', () => {
    let back = 0;
    const el = dom.buildNotFound({ onBack: () => { back += 1; } });
    assert.ok(el.textContent.includes('Study not found.'));
    el.querySelector('.study-back').click();
    assert.equal(back, 1);
});

test('without the key verse card script (an older cached page) the key verse still shows as plain text', () => {
    const plainDom = W.DiscoveryDetailDom.createDetailDom({ h: W.DomBuilder.createBuilder(doc), t, keyVerseCard: null });
    const study = fixture('ascension_victory_en_001.json');
    const el = plainDom.buildPage(pageOf(study, 0));
    assert.equal(el.querySelector('.key-verse-card'), null);
    assert.equal(el.querySelector('.study-keyverse-text').textContent, study.key_verse.text);
});

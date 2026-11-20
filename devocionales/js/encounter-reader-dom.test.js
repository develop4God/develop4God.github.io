'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { FakeDocument } = require('./fake-dom.helper');

global.window = global.window || {};
for (const name of ['dom-builder.js', 'ui-pager-dots.js', 'discovery-cards.js', 'key-verse-card.js', 'encounter-reader-dom.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const { createBuilder } = global.window.DomBuilder;

// Keys are the app's `encounters.*` strings in the web lang files; the test uses the key names.
const t = (k) => k;

function setup() {
    const doc = new FakeDocument();
    const h = createBuilder(doc);
    const images = [];
    const dom = global.window.EncounterReaderDom.createReaderDom({
        h,
        t,
        imageUrlFor: (encId, file) => { images.push([encId, file]); return `https://cdn.test/${encId}/${file}.webp`; },
    });
    return { doc, dom, images };
}

const pageFor = (card) => ({ kind: 'card', card, sectionIndex: 0, isLast: false });
const text = (el) => el.textContent;

test('key verse page: label, verse text and reference, all as text', () => {
    const { dom } = setup();
    const el = dom.buildPage({ kind: 'keyVerse', keyVerse: { reference: 'Mark 10:46', text: 'And they came <b>to</b> Jericho' } }, 'b1');
    assert.match(text(el), /key_verse/);
    assert.match(text(el), /And they came <b>to<\/b> Jericho/);
    assert.equal(el.querySelector('b'), null, 'remote text must never become markup');
    assert.match(text(el), /Mark 10:46/);
});

test('cinematic_scene: title, narrative, verse overlay, revelation key and the image URL', () => {
    const { dom, images } = setup();
    const el = dom.buildPage(pageFor({
        type: 'cinematic_scene', title: 'The Side of the Road.', narrative: 'Jericho: dust.',
        image_url: 'bartimaeus_roadside_dust.png', revelation_key: 'God sees those the world stopped seeing.',
        verse_overlay: { reference: 'Mark 10:49', text: 'Jesus stood still' },
    }), 'bartimaeus_001');
    assert.match(text(el), /The Side of the Road\./);
    assert.match(text(el), /Jericho: dust\./);
    assert.match(text(el), /Mark 10:49/);
    assert.match(text(el), /Jesus stood still/);
    assert.match(text(el), /God sees those the world stopped seeing\./);
    assert.deepEqual(images, [['bartimaeus_001', 'bartimaeus_roadside_dust.png']]);
    assert.equal(el.querySelector('img').getAttribute('src'), 'https://cdn.test/bartimaeus_001/bartimaeus_roadside_dust.png.webp');
});

test('the image has an empty alt (decorative) and hides itself on error without blocking the text', () => {
    const { dom } = setup();
    const el = dom.buildPage(pageFor({ type: 'cinematic_scene', title: 'x', image_url: 'a.png' }), 'b1');
    const img = el.querySelector('img');
    assert.equal(img.getAttribute('alt'), '');
    assert.equal(img.getAttribute('loading'), 'lazy');
    img.dispatch('error', { target: img });
    assert.equal(img.hidden, true);
    assert.match(text(el), /x/);
});

test('a card without image_url renders no image element', () => {
    const { dom } = setup();
    const el = dom.buildPage(pageFor({ type: 'character_moment', title: 'Be Quiet', content: 'The crowd rebuked him.' }), 'b1');
    assert.equal(el.querySelector('img'), null);
    assert.match(text(el), /The crowd rebuked him\./);
});

test('scripture_moment: verse reference and text, then the reflection', () => {
    const { dom } = setup();
    const el = dom.buildPage(pageFor({
        type: 'scripture_moment', verse_reference: 'Mark 10:51', verse_text: 'What wilt thou that I should do unto thee?',
        reflection: 'This is the same question Jesus asked James and John.',
    }), 'b1');
    assert.match(text(el), /Mark 10:51/);
    assert.match(text(el), /What wilt thou/);
    assert.match(text(el), /same question/);
});

test('character_moment and theological_depth render title, subtitle and content', () => {
    const { dom } = setup();
    for (const type of ['character_moment', 'theological_depth']) {
        const el = dom.buildPage(pageFor({ type, title: 'The Cloak He Threw', subtitle: 'The smallest detail', content: 'Mark includes a detail.' }), 'b1');
        assert.match(text(el), /The Cloak He Threw/);
        assert.match(text(el), /The smallest detail/);
        assert.match(text(el), /Mark includes a detail\./);
    }
});

test('discovery_activation: each question with its category, then the prayer', () => {
    const { dom } = setup();
    const el = dom.buildPage(pageFor({
        type: 'discovery_activation', title: 'Your Encounter',
        discovery_questions: [{ category: 'Honesty', question: 'Where are you sitting by the road?' }],
        prayer: { title: 'Prayer of the Roadside', content: 'Lord Jesus, have mercy on me.' },
    }), 'b1');
    assert.match(text(el), /HONESTY/); // categories and prayer titles are uppercased, as in the app
    assert.match(text(el), /Where are you sitting by the road\?/);
    assert.match(text(el), /PRAYER OF THE ROADSIDE/);
    assert.match(text(el), /Lord Jesus, have mercy on me\./);
});

test('interactive_moment renders its prompt as text (no minigame)', () => {
    const { dom } = setup();
    const el = dom.buildPage(pageFor({ type: 'interactive_moment', title: 'Pause', reflection_prompt: 'Name one place you wait.' }), 'b1');
    assert.match(text(el), /Name one place you wait\./);
});

test('completion card shows its verse; the completion button lives in the footer', () => {
    const { dom } = setup();
    const el = dom.buildPage({ kind: 'card', card: { type: 'completion', completion_verse: { reference: 'Mark 10:52', text: 'Go thy way' } }, sectionIndex: 2, isLast: true }, 'b1');
    assert.match(text(el), /Mark 10:52/);
    assert.match(text(el), /Go thy way/);
    assert.equal(el.querySelector('button'), null);
});

test('unknown card type still shows its common text fields (never a blank card)', () => {
    const { dom } = setup();
    const el = dom.buildPage(pageFor({ type: 'future_type', title: 'Future', narrative: 'Some narrative.' }), 'b1');
    assert.match(text(el), /Future/);
    assert.match(text(el), /Some narrative\./);
});

test('a missing field renders no empty element', () => {
    const { dom } = setup();
    const el = dom.buildPage(pageFor({ type: 'cinematic_scene', title: 'Only a title' }), 'b1');
    assert.equal(el.querySelector('.reader-empty'), null);
    assert.match(text(el), /Only a title/);
});

test('intro: image, title, subtitle, scripture, minutes and testament, with the enter button', () => {
    const { dom, images } = setup();
    let entered = 0;
    const el = dom.buildIntro({
        id: 'bartimaeus_001', title: 'Bartimaeus', subtitle: 'Blind, and still crying out', scripture: 'Mark 10:46-52', minutes: 7,
        testament: 'new', emoji: '👁️', introImage: 'bartimaeus_intro', accent: '#2a1500',
    }, { onEnter: () => { entered += 1; }, onBack: () => {} });
    assert.match(text(el), /Bartimaeus/);
    assert.match(text(el), /Blind, and still crying out/);
    assert.match(text(el), /Mark 10:46-52/);
    assert.match(text(el), /7/);
    assert.match(text(el), /new_testament/);
    assert.deepEqual(images, [['bartimaeus_001', 'bartimaeus_intro']]);
    el.querySelector('.encounter-intro-enter').dispatch('click');
    assert.equal(entered, 1);
});

test('intro: an accent colour outside #rrggbb is not applied as a style', () => {
    const { dom } = setup();
    const el = dom.buildIntro({ title: 'x', subtitle: '', scripture: '', minutes: 5, testament: '', emoji: '📖', introImage: '', accent: 'red; background:url(x)' }, { onEnter: () => {}, onBack: () => {} });
    assert.equal(el.querySelector('.encounter-intro-media').getAttribute('style'), null);
});

test('progress bar: one dot per page, the current one marked, tapping a dot jumps to it', () => {
    const { dom } = setup();
    let picked = null;
    const el = dom.buildProgress(4, 1, 'Bartimaeus', { onSelect: (i) => { picked = i; } });
    const dots = el.querySelectorAll('.pager-dot');
    assert.equal(dots.length, 4);
    assert.equal(dots[1].getAttribute('aria-current'), 'step');
    dots[3].dispatch('click');
    assert.equal(picked, 3);
});

test('footer: a complete button before completion, a disabled completed state after, and the copyright text', () => {
    const { dom } = setup();
    let completed = 0;
    const open = dom.buildFooter({ isCompleted: false, copyright: 'copyright text', onComplete: () => { completed += 1; } });
    assert.match(text(open.querySelector('.encounter-complete')), /complete/);
    assert.equal(open.querySelector('.encounter-complete').getAttribute('disabled'), null);
    open.querySelector('.encounter-complete').dispatch('click');
    assert.equal(completed, 1);
    assert.match(text(open), /copyright text/);

    const done = dom.buildFooter({ isCompleted: true, copyright: '', onComplete: () => {} });
    assert.equal(done.querySelector('.encounter-complete').getAttribute('disabled'), '');
});

test('nav: previous is disabled on the first page; on the last page the next button becomes exit', () => {
    const { dom } = setup();
    const first = dom.buildNav({ index: 0, total: 3, onPrev: () => {}, onNext: () => {}, onExit: () => {} });
    assert.equal(first.querySelector('.encounter-prev').getAttribute('disabled'), '');
    assert.ok(first.querySelector('.encounter-next'));
    const last = dom.buildNav({ index: 2, total: 3, onPrev: () => {}, onNext: () => {}, onExit: () => {} });
    assert.equal(last.querySelector('.encounter-next'), null);
    assert.ok(last.querySelector('.encounter-exit'));
});

test('not-found and error states are alerts with a way back', () => {
    const { dom } = setup();
    let back = 0;
    let retry = 0;
    const nf = dom.buildNotFound({ onBack: () => { back += 1; } });
    assert.equal(nf.getAttribute('role'), 'alert');
    nf.querySelector('.encounter-back').dispatch('click');
    assert.equal(back, 1);
    const err = dom.buildError({ onRetry: () => { retry += 1; } });
    assert.equal(err.getAttribute('role'), 'alert');
    err.querySelector('.encounter-retry').dispatch('click');
    assert.equal(retry, 1);
});

test('cinematic_scene and scripture_moment render scripture_connections, as the app does', () => {
    const { dom } = setup();
    const connections = [{ reference: 'John 1:42', text: 'You shall be called Cephas' }];
    const cine = dom.buildPage(pageFor({ type: 'cinematic_scene', title: 'x', scripture_connections: connections }), 'b1');
    assert.match(text(cine), /John 1:42/);
    assert.match(text(cine), /You shall be called Cephas/);
    const scrip = dom.buildPage(pageFor({ type: 'scripture_moment', verse_reference: 'Mark 10:51', scripture_connections: connections }), 'b1');
    assert.match(text(scrip), /John 1:42/);
});

test('footer: the completed button carries the pop class; the pending one does not', () => {
    const { dom } = setup();
    const done = dom.buildFooter({ isCompleted: true, copyright: '', onComplete: () => {} });
    assert.ok(done.querySelector('.encounter-complete').classList.contains('encounter-complete--pop'));
    const open = dom.buildFooter({ isCompleted: false, copyright: '', onComplete: () => {} });
    assert.equal(open.querySelector('.encounter-complete').classList.contains('encounter-complete--pop'), false);
});

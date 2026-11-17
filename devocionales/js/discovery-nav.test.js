'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
const filename = path.join(__dirname, 'discovery-nav.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
const { parseRoute, buildStudyUrl, classifySwipe, keyAction, isTypingTarget } = global.window.DiscoveryNav;

test('parseRoute: ?id= selects a study, anything else is the list', () => {
    assert.deepEqual(parseRoute('?id=foot_washing&lang=en'), { studyId: 'foot_washing' });
    assert.deepEqual(parseRoute('?lang=en'), { studyId: null });
    assert.deepEqual(parseRoute(''), { studyId: null });
    assert.deepEqual(parseRoute('?id='), { studyId: null });
});

test('parseRoute: decodes the id and ignores junk input', () => {
    assert.deepEqual(parseRoute('?id=a%20b'), { studyId: 'a b' });
    assert.deepEqual(parseRoute(undefined), { studyId: null });
    assert.deepEqual(parseRoute(null), { studyId: null });
});

test('buildStudyUrl: keeps other params (language), sets and encodes id; null id removes it', () => {
    assert.equal(buildStudyUrl('/devocionales/estudios/', '?lang=es', 'a b'), '/devocionales/estudios/?lang=es&id=a+b');
    assert.equal(buildStudyUrl('/devocionales/estudios/', '?lang=es&id=x', 'y'), '/devocionales/estudios/?lang=es&id=y');
    assert.equal(buildStudyUrl('/devocionales/estudios/', '?lang=es&id=x', null), '/devocionales/estudios/?lang=es');
    assert.equal(buildStudyUrl('/devocionales/estudios/', '', null), '/devocionales/estudios/');
});

test('classifySwipe: a clear horizontal swipe left goes next, right goes previous (LTR)', () => {
    assert.equal(classifySwipe({ dx: -80, dy: 5 }), 'next');
    assert.equal(classifySwipe({ dx: 80, dy: -5 }), 'prev');
});

test('classifySwipe: RTL mirrors the direction', () => {
    assert.equal(classifySwipe({ dx: -80, dy: 0 }, { rtl: true }), 'prev');
    assert.equal(classifySwipe({ dx: 80, dy: 0 }, { rtl: true }), 'next');
});

test('classifySwipe: short moves and mostly-vertical scrolls are not swipes', () => {
    assert.equal(classifySwipe({ dx: -20, dy: 0 }), null);
    assert.equal(classifySwipe({ dx: -80, dy: 90 }), null);
    assert.equal(classifySwipe({ dx: 0, dy: 0 }), null);
    assert.equal(classifySwipe(null), null);
    assert.equal(classifySwipe({ dx: NaN, dy: 0 }), null);
});

test('keyAction: arrows page (mirrored in RTL), other keys do nothing', () => {
    assert.equal(keyAction('ArrowRight'), 'next');
    assert.equal(keyAction('ArrowLeft'), 'prev');
    assert.equal(keyAction('ArrowRight', { rtl: true }), 'prev');
    assert.equal(keyAction('ArrowLeft', { rtl: true }), 'next');
    assert.equal(keyAction('Enter'), null);
    assert.equal(keyAction(undefined), null);
});

test('isTypingTarget: arrow keys belong to inputs, selects, textareas, editable content and sliders, not to paging', () => {
    for (const tag of ['INPUT', 'SELECT', 'TEXTAREA']) assert.equal(isTypingTarget({ tagName: tag }), true, tag);
    assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
    assert.equal(isTypingTarget({ tagName: 'DIV', getAttribute: (k) => (k === 'role' ? 'slider' : null) }), true);
    assert.equal(isTypingTarget({ tagName: 'BODY' }), false);
    assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
    assert.equal(isTypingTarget(null), false);
});

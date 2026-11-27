'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
const filename = path.join(__dirname, 'devotional-support-link.js');
vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(window);
const { apply, SUPPORT_LANGUAGES } = window.DevotionalSupportLink;

// Just enough of an element: a class list.
function button(initial) {
    const classes = new Set(initial);
    return {
        classes,
        classList: {
            toggle: (name, force) => { if (force) classes.add(name); else classes.delete(name); },
            contains: (name) => classes.has(name),
        },
    };
}

test('SUPPORT_LANGUAGES are exactly the languages the Apóyanos page is translated into', () => {
    const files = fs.readdirSync(path.join(__dirname, '..', '..', 'lang', 'apoyanos')).map((f) => f.replace('.json', ''));
    assert.deepEqual([...SUPPORT_LANGUAGES].sort(), files.sort());
});

test('apply: translated languages show the button as a flex row', () => {
    for (const lang of ['es', 'en', 'fr', 'ja', 'ar']) {
        const el = button(['hidden']);
        apply(el, lang);
        assert.equal(el.classes.has('hidden'), false, lang);
        assert.equal(el.classes.has('flex'), true, lang);
    }
});

test('apply: a language without an Apóyanos translation keeps the button hidden', () => {
    for (const lang of ['ru', 'ko', 'zz']) {
        const el = button(['hidden']);
        apply(el, lang);
        assert.equal(el.classes.has('hidden'), true, lang);
        assert.equal(el.classes.has('flex'), false, lang);
    }
});

test('apply: switching language back and forth toggles it both ways', () => {
    const el = button(['hidden']);
    apply(el, 'en');
    apply(el, 'ko');
    assert.equal(el.classes.has('hidden'), true);
    apply(el, 'es');
    assert.equal(el.classes.has('hidden'), false);
});

test('apply: an unknown language (translations not ready) or a missing button does nothing harmful', () => {
    const el = button(['hidden']);
    apply(el, undefined);
    assert.equal(el.classes.has('hidden'), true);
    assert.doesNotThrow(() => apply(null, 'en'));
});

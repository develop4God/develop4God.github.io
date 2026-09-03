'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// app-stats.js is a browser IIFE that attaches to `window` and, when a real
// `document` exists, bootstraps a fetch on load. Node has no `document`, so
// the module skips that bootstrap entirely and only exposes the pure
// `applyStats` function for testing — see the `typeof document !== 'undefined'`
// guard in the source.
global.window = global.window || {};

function makeElement(statKey, initialText) {
    return {
        _statKey: statKey,
        textContent: initialText,
        getAttribute(name) {
            return name === 'data-app-stat' ? this._statKey : null;
        },
    };
}

const filename = path.join(__dirname, 'app-stats.js');
const source = fs.readFileSync(filename, 'utf8');
// vm.runInThisContext (not new Function) so c8/V8 can attribute coverage
// back to this real filename instead of an anonymous eval.
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { applyStats } = global.window.AppStats;

test('applyStats: fills matching elements with the stat value', () => {
    const downloadsEl = makeElement('downloads', '+5,000');
    const ratingEl = makeElement('ratingStars', '⭐');
    global.document = {
        querySelectorAll: () => [downloadsEl, ratingEl],
    };

    applyStats({ downloads: '+18K', ratingStars: '⭐⭐⭐⭐⭐' });

    assert.equal(downloadsEl.textContent, '+18K');
    assert.equal(ratingEl.textContent, '⭐⭐⭐⭐⭐');
});

test('applyStats: leaves an element untouched when its key is missing from the stats object', () => {
    const el = makeElement('unknownStat', 'original');
    global.document = {
        querySelectorAll: () => [el],
    };

    applyStats({ downloads: '+18K' });

    assert.equal(el.textContent, 'original');
});

test('applyStats: does nothing when there are no matching elements', () => {
    global.document = {
        querySelectorAll: () => [],
    };

    assert.doesNotThrow(() => applyStats({ downloads: '+18K' }));
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { hasShared, markShared, resetShared, KEY } = (() => {
    const source = require('node:fs').readFileSync(
        require('node:path').join(__dirname, 'devotional-share-gate.js'),
        'utf8',
    );
    const win = {};
    require('node:vm').runInThisContext(
        `(function(window){${source}\n})`,
        { filename: 'devotional-share-gate.js' },
    )(win);
    return win.DevotionalShareGate;
})();

function freshStorage() {
    const store = {};
    return {
        getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem(k, v) { store[k] = String(v); },
        removeItem(k) { delete store[k]; },
    };
}

test('share gate key is "develop4God_shared"', () => {
    assert.equal(KEY, 'develop4God_shared');
});

test('hasShared returns false when nothing stored', () => {
    assert.equal(hasShared(freshStorage()), false);
});

test('hasShared returns false for unrelated storage keys', () => {
    const s = freshStorage();
    s.setItem('other', '1');
    assert.equal(hasShared(s), false);
});

test('markShared then hasShared returns true', () => {
    const s = freshStorage();
    assert.equal(hasShared(s), false);
    markShared(s);
    assert.equal(hasShared(s), true);
});

test('resetShared clears the flag', () => {
    const s = freshStorage();
    markShared(s);
    assert.equal(hasShared(s), true);
    resetShared(s);
    assert.equal(hasShared(s), false);
});

test('storage failures do not throw', () => {
    const boom = {
        getItem() { throw new Error('no storage'); },
        setItem() { throw new Error('no storage'); },
        removeItem() { throw new Error('no storage'); },
    };
    assert.equal(hasShared(boom), false);
    assert.doesNotThrow(() => markShared(boom));
    assert.doesNotThrow(() => resetShared(boom));
});

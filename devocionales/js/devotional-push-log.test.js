const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(win) {
    const filename = path.join(__dirname, 'devotional-push-log.js');
    const source = fs.readFileSync(filename, 'utf8');
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalPushLog;
}

function fakeWin({ search = '', stored = null, throwingStorage = false } = {}) {
    const lines = [];
    return {
        lines,
        location: { search },
        console: { info: (...args) => lines.push(args) },
        localStorage: {
            getItem: (key) => {
                if (throwingStorage) throw new Error('blocked');
                return key === 'devotionalPush.debug' ? stored : null;
            },
        },
    };
}

test('off by default: nothing is printed or kept', () => {
    const win = fakeWin();
    load(win).create(win).log('init', { a: 1 });
    assert.deepEqual(win.lines, []);
    assert.equal(win.__pushLog, undefined);
});

test('?pushdebug=1 turns it on: prints "[push] step" and keeps the entry in window.__pushLog', () => {
    const win = fakeWin({ search: '?lang=en&pushdebug=1' });
    load(win).create(win).log('permission', { result: 'denied' });
    assert.deepEqual(win.lines, [['[push] permission', { result: 'denied' }]]);
    assert.equal(win.__pushLog.length, 1);
    assert.equal(win.__pushLog[0].step, 'permission');
    assert.deepEqual(win.__pushLog[0].detail, { result: 'denied' });
});

test('the localStorage flag turns it on; any other value or ?pushdebug=0 does not', () => {
    const on = fakeWin({ stored: '1' });
    load(on).create(on).log('x');
    assert.equal(on.lines.length, 1);
    for (const win of [fakeWin({ stored: '0' }), fakeWin({ search: '?pushdebug=0' }), fakeWin({ search: '?pushdebug=10' })]) {
        load(win).create(win).log('x');
        assert.equal(win.lines.length, 0);
    }
});

test('an Error in the detail is reduced to name and message (it must be readable in the console and in JSON)', () => {
    const win = fakeWin({ search: '?pushdebug=1' });
    load(win).create(win).log('failed', { error: new TypeError('nope') });
    assert.deepEqual(win.__pushLog[0].detail.error, { name: 'TypeError', message: 'nope' });
});

test('blocked storage, a missing console and a missing location never throw', () => {
    const blocked = fakeWin({ throwingStorage: true });
    assert.doesNotThrow(() => load(blocked).create(blocked).log('x'));
    const bare = { search: undefined };
    assert.doesNotThrow(() => load(bare).create(bare).log('x'));
    const noConsole = fakeWin({ search: '?pushdebug=1' });
    delete noConsole.console;
    assert.doesNotThrow(() => load(noConsole).create(noConsole).log('x'));
    assert.equal(noConsole.__pushLog.length, 1);
});

test('the kept log is capped so a long session cannot grow it without bound', () => {
    const win = fakeWin({ search: '?pushdebug=1' });
    const { log } = load(win).create(win);
    for (let i = 0; i < 250; i += 1) log(`s${i}`);
    assert.equal(win.__pushLog.length, 100);
    assert.equal(win.__pushLog[99].step, 's249');
});

test('?pushdebug=0 clears a stored flag, so a tester in an installed app can turn logging off', () => {
    const removed = [];
    const win = fakeWin({ search: '?pushdebug=0', stored: '1' });
    win.localStorage.removeItem = (key) => removed.push(key);
    load(win).create(win).log('x');
    assert.deepEqual(removed, ['devotionalPush.debug']);
    assert.equal(win.lines.length, 0);
});

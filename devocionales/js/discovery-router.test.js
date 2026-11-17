'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};
for (const name of ['discovery-nav.js', 'discovery-router.js']) {
    const filename = path.join(__dirname, name);
    vm.runInThisContext(`(function(window){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(global.window);
}
const W = global.window;

// A tiny History/Location pair: entries are { url, state }, popstate fires on back like a browser.
function fakeWindow(startUrl) {
    const entries = [{ url: startUrl, state: null }];
    let at = 0;
    const listeners = [];
    const parse = () => {
        const u = new URL(entries[at].url, 'http://x');
        return { pathname: u.pathname, search: u.search };
    };
    const win = {
        entries,
        location: { get pathname() { return parse().pathname; }, get search() { return parse().search; } },
        history: {
            get state() { return entries[at].state; },
            pushState: (state, _t, url) => { entries.splice(at + 1); entries.push({ url, state }); at += 1; },
            replaceState: (state, _t, url) => { entries[at] = { url, state }; },
            back: () => { at -= 1; listeners.forEach((fn) => fn({ state: entries[at].state })); },
        },
        addEventListener: (type, fn) => { if (type === 'popstate') listeners.push(fn); },
    };
    return win;
}

function setup(url = '/devocionales/estudios/?lang=en') {
    const win = fakeWindow(url);
    const calls = [];
    const router = W.DiscoveryRouter.createRouter({
        win,
        nav: W.DiscoveryNav,
        onList: () => calls.push('list'),
        onDetail: (id) => calls.push(`detail:${id}`),
    });
    return { win, calls, router };
}

test('start: a plain URL shows the list', () => {
    const { router, calls } = setup();
    router.start();
    assert.deepEqual(calls, ['list']);
});

test('C6 start: a deep link ?id= opens that study directly', () => {
    const { router, calls } = setup('/devocionales/estudios/?lang=en&id=love');
    router.start();
    assert.deepEqual(calls, ['detail:love']);
});

test('open: pushes a history entry keeping the language and shows the study', () => {
    const { router, calls, win } = setup();
    router.start();
    router.open('love');
    assert.deepEqual(calls, ['list', 'detail:love']);
    assert.equal(win.location.search, '?lang=en&id=love');
    assert.equal(win.history.state.studyOpen, true);
});

test('C7 back closes the study and returns to the list without leaving the page', () => {
    const { router, calls, win } = setup();
    router.start();
    router.open('love');
    win.history.back();
    assert.deepEqual(calls, ['list', 'detail:love', 'list']);
    assert.equal(win.location.pathname, '/devocionales/estudios/');
});

test('close after opening from the list goes back in history (one entry, no duplicates)', () => {
    const { router, calls, win } = setup();
    router.start();
    router.open('love');
    router.close();
    assert.deepEqual(calls, ['list', 'detail:love', 'list']);
    assert.equal(win.entries.length, 2);
});

test('close on a deep link (no history entry of ours) replaces the URL with the list', () => {
    const { router, calls, win } = setup('/devocionales/estudios/?lang=en&id=love');
    router.start();
    router.close();
    assert.deepEqual(calls, ['detail:love', 'list']);
    assert.equal(win.location.search, '?lang=en');
    assert.equal(win.entries.length, 1, 'the back button still leaves the page');
});

test('opening a second study then going back lands on the list, not the first study', () => {
    const { router, calls, win } = setup();
    router.start();
    router.open('a');
    win.history.back();
    router.open('b');
    assert.deepEqual(calls, ['list', 'detail:a', 'list', 'detail:b']);
});

test('refresh re-applies the current route (language change while reading)', () => {
    const { router, calls } = setup('/devocionales/estudios/?lang=en&id=love');
    router.start();
    router.refresh();
    assert.deepEqual(calls, ['detail:love', 'detail:love']);
});

test('current() reports the open study id or null', () => {
    const { router } = setup('/devocionales/estudios/?id=x');
    assert.equal(router.current(), 'x');
    assert.equal(setup().router.current(), null);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const filename = path.join(__dirname, 'devotional-install.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalInstall;
}

const { init } = loadModule();

function fakeButton() {
    const classes = new Set(['hidden']);
    const listeners = {};
    return {
        listeners,
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            contains: (name) => classes.has(name),
        },
        addEventListener: (type, handler) => { listeners[type] = handler; },
        get shown() { return !classes.has('hidden'); },
    };
}

function fakeWindow() {
    const listeners = {};
    return {
        listeners,
        addEventListener: (type, handler) => { listeners[type] = handler; },
    };
}

const doc = (button) => ({ querySelector: (selector) => (selector === '[data-install]' ? button : null) });

function promptEvent({ rejects = false } = {}) {
    const event = {
        defaultPrevented: false,
        prompts: 0,
        preventDefault() { this.defaultPrevented = true; },
        prompt() {
            this.prompts += 1;
            return rejects ? Promise.reject(new Error('refused')) : Promise.resolve();
        },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
    };
    return event;
}

test('the install button stays hidden until the browser reports the app is installable', () => {
    const button = fakeButton();
    init(doc(button), fakeWindow());
    assert.equal(button.shown, false);
});

test('beforeinstallprompt is deferred (no mini-infobar) and reveals the button', () => {
    const button = fakeButton();
    const win = fakeWindow();
    init(doc(button), win);
    const event = promptEvent();
    win.listeners.beforeinstallprompt(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(button.shown, true);
});

test('a tap opens the browser prompt once and hides the button, whatever the answer', async () => {
    const button = fakeButton();
    const win = fakeWindow();
    init(doc(button), win);
    const event = promptEvent();
    win.listeners.beforeinstallprompt(event);
    await button.listeners.click();
    assert.equal(event.prompts, 1);
    assert.equal(button.shown, false);
    await button.listeners.click();
    assert.equal(event.prompts, 1);
});

test('a tap before any install offer does nothing', async () => {
    const button = fakeButton();
    init(doc(button), fakeWindow());
    await assert.doesNotReject(async () => button.listeners.click());
    assert.equal(button.shown, false);
});

test('a refused prompt does not throw and leaves the button hidden', async () => {
    const button = fakeButton();
    const win = fakeWindow();
    init(doc(button), win);
    win.listeners.beforeinstallprompt(promptEvent({ rejects: true }));
    await assert.doesNotReject(async () => button.listeners.click());
    assert.equal(button.shown, false);
});

test('appinstalled hides the button', () => {
    const button = fakeButton();
    const win = fakeWindow();
    init(doc(button), win);
    win.listeners.beforeinstallprompt(promptEvent());
    assert.equal(button.shown, true);
    win.listeners.appinstalled();
    assert.equal(button.shown, false);
});

test('a page without the button registers nothing and does not throw', () => {
    const win = fakeWindow();
    assert.doesNotThrow(() => init(doc(null), win));
    assert.deepEqual(Object.keys(win.listeners), []);
});

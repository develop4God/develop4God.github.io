const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filename = path.join(__dirname, 'devotional-update-banner.js');

function loadModule() {
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalUpdateBanner;
}

const { watch, SKIP_WAITING_MESSAGE } = loadModule();

// A tiny DOM: enough for the banner to build, find and click its elements.
function fakeElement(tagName) {
    const element = {
        tagName,
        children: [],
        attrs: {},
        listeners: {},
        className: '',
        textContent: '',
        disabled: false,
        setAttribute(name, value) { element.attrs[name] = value; },
        append(...nodes) { element.children.push(...nodes); },
        addEventListener(type, handler) { element.listeners[type] = handler; },
        click() { if (!element.disabled && element.listeners.click) element.listeners.click(); },
    };
    return element;
}

function fakeDocument({ withBody = true } = {}) {
    return { body: withBody ? fakeElement('body') : null, createElement: fakeElement };
}

const findAll = (root, tagName) => root.children.flatMap((child) => [
    ...(child.tagName === tagName ? [child] : []),
    ...findAll(child, tagName),
]);

function fakeServiceWorker({ controller = {} } = {}) {
    const listeners = {};
    return {
        controller,
        listeners,
        addEventListener(type, handler) { listeners[type] = handler; },
        fire(type) { if (listeners[type]) listeners[type](); },
    };
}

function fakeRegistration({ waiting = null } = {}) {
    const listeners = {};
    const registration = {
        waiting,
        installing: null,
        listeners,
        addEventListener(type, handler) { listeners[type] = handler; },
    };
    return registration;
}

function fakeWorker() {
    const posted = [];
    return { posted, postMessage: (message) => posted.push(message) };
}

function setup({ controller, waiting, i18n, withBody } = {}) {
    const document = fakeDocument({ withBody });
    const serviceWorker = fakeServiceWorker({ controller });
    const reloads = [];
    const win = {
        document,
        navigator: { serviceWorker },
        location: { reload: () => reloads.push(true) },
        DevotionalI18n: i18n,
    };
    const registration = fakeRegistration({ waiting });
    return { win, document, serviceWorker, registration, reloads };
}

const banners = (document) => findAll(document.body, 'div').filter((el) => el.className.includes('update-banner'));
const buttonOf = (document) => findAll(document.body, 'button')[0];

test('the message type is the one the worker listens for', () => {
    assert.equal(SKIP_WAITING_MESSAGE, 'devocionales-skip-waiting');
});

test('a waiting worker on a page that already has one shows the banner, as a polite status with a typed button', () => {
    const { win, document, registration } = setup({ waiting: fakeWorker() });
    watch(win, registration);
    assert.equal(banners(document).length, 1);
    const [banner] = banners(document);
    assert.equal(banner.attrs.role, 'status');
    assert.equal(banner.attrs['aria-live'], 'polite');
    assert.equal(buttonOf(document).attrs.type, 'button');
});

test('no banner for a first install (the page has no controller yet) or when nothing is waiting', () => {
    const first = setup({ controller: null, waiting: fakeWorker() });
    watch(first.win, first.registration);
    assert.equal(banners(first.document).length, 0, 'the first worker is not an update');

    const idle = setup({ waiting: null });
    watch(idle.win, idle.registration);
    assert.equal(banners(idle.document).length, 0);
});

test('a worker that finishes installing later shows the banner once, however many times it is checked', () => {
    const { win, document, registration } = setup();
    watch(win, registration);
    assert.equal(banners(document).length, 0);

    const installing = { state: 'installing', listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    registration.installing = installing;
    registration.listeners.updatefound();
    installing.state = 'installed';
    registration.waiting = fakeWorker();
    installing.listeners.statechange();
    installing.listeners.statechange();
    assert.equal(banners(document).length, 1);
});

test('an installing worker that does not reach installed shows nothing', () => {
    const { win, document, registration } = setup();
    watch(win, registration);
    const installing = { state: 'installing', listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    registration.installing = installing;
    registration.listeners.updatefound();
    installing.state = 'redundant';
    installing.listeners.statechange();
    assert.equal(banners(document).length, 0);
});

test('updatefound with no installing worker is ignored', () => {
    const { win, document, registration } = setup();
    watch(win, registration);
    assert.doesNotThrow(() => registration.listeners.updatefound());
    assert.equal(banners(document).length, 0);
});

test('tapping Update asks the waiting worker to take over with force, and reloads only once it has', () => {
    const worker = fakeWorker();
    const { win, document, serviceWorker, registration, reloads } = setup({ waiting: worker });
    watch(win, registration);
    buttonOf(document).click();
    assert.deepEqual(worker.posted, [{ type: 'devocionales-skip-waiting', force: true }]);
    assert.equal(reloads.length, 0, 'not before the new worker controls the page');
    serviceWorker.fire('controllerchange');
    assert.equal(reloads.length, 1);
});

test('tapping twice sends one request, and the button shows it is busy', () => {
    const worker = fakeWorker();
    const { win, document, registration } = setup({ waiting: worker });
    watch(win, registration);
    const button = buttonOf(document);
    button.click();
    button.click();
    assert.equal(worker.posted.length, 1);
    assert.equal(button.disabled, true);
    assert.equal(button.attrs['aria-busy'], 'true');
});

test('when another tab already switched (nothing waits any more), tapping Update just reloads', () => {
    const worker = fakeWorker();
    const { win, document, registration, reloads } = setup({ waiting: worker });
    watch(win, registration);
    registration.waiting = null;
    buttonOf(document).click();
    assert.equal(reloads.length, 1);
    assert.equal(worker.posted.length, 0);
});

test('the texts come from the reader language, with English fallbacks', () => {
    const asked = [];
    const i18n = { t: (key) => { asked.push(key); return `[${key}]`; } };
    const translated = setup({ waiting: fakeWorker(), i18n });
    watch(translated.win, translated.registration);
    assert.deepEqual([...new Set(asked)].sort(), ['shell.updateAction', 'shell.updateAvailable']);
    assert.match(findAll(translated.document.body, 'span')[0].textContent, /shell\.updateAvailable/);
    assert.equal(buttonOf(translated.document).textContent, '[shell.updateAction]');

    const plain = setup({ waiting: fakeWorker() });
    watch(plain.win, plain.registration);
    assert.equal(findAll(plain.document.body, 'span')[0].textContent, 'A new version is available');
    assert.equal(buttonOf(plain.document).textContent, 'Update');
});

test('a broken translator falls back to English instead of breaking the banner', () => {
    const { win, document, registration } = setup({ waiting: fakeWorker(), i18n: { t() { throw new Error('boom'); } } });
    assert.doesNotThrow(() => watch(win, registration));
    assert.equal(buttonOf(document).textContent, 'Update');
});

test('missing pieces never throw: no registration, no service worker, no body', () => {
    assert.doesNotThrow(() => watch({}, null));
    assert.doesNotThrow(() => watch({ navigator: {} }, fakeRegistration()));
    const noBody = setup({ waiting: fakeWorker(), withBody: false });
    assert.doesNotThrow(() => watch(noBody.win, noBody.registration));
});

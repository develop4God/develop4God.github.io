'use strict';

// Runs the real worker template (scripts/sw.template.js) in a sandbox with a fake Cache API and a
// scripted network, and checks what it answers, caches and deletes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { renderSw } = require('./build-sw.js');

const TEMPLATE_PATH = path.join(__dirname, 'sw.template.js');
const TEMPLATE = fs.readFileSync(TEMPLATE_PATH, 'utf8');
const ORIGIN = 'http://localhost';
const DATA_HOST = 'raw.githubusercontent.com';
const YEAR_URL = `https://${DATA_HOST}/develop4God/Devocionales-json/refs/heads/main/Devocional_year_2026.json`;
const INDEX_URL = `https://${DATA_HOST}/develop4God/Devocionales-json/refs/heads/main/index.json`;
const ASSETS_URL = `https://${DATA_HOST}/develop4God/Devocionales-assets/main/images/devotionals/index.json`;

const CONFIG = {
    version: 'v1',
    timeoutMs: 40,
    freshTimeoutMs: 20, // the page blocks on the config script, so its wait is shorter than the data wait
    maxDataEntries: 3,
    dataHost: DATA_HOST,
    dataPathPrefixes: [
        '/develop4God/Devocionales-json/',
        '/develop4God/Devocionales-assets/main/images/devotionals/index.json',
    ],
    imagePathPrefix: '/develop4God/Devocionales-assets/main/images/devotionals/',
    maxImageEntries: 3,
    freshFirst: ['/devocionales/js/devotional-pwa-config.js'],
    sameOriginData: ['/data/app-stats.json'],
    installAttempts: 3,
    installRetryDelayMs: 1,
    pages: ['/devocionales/privacy-policy.html'],
    precache: [
        '/devocionales/',
        '/devocionales/privacy-policy.html',
        '/devocionales/vendor/tailwind.css',
        '/devocionales/js/devotional-pwa-config.js',
        '/js/shared.js',
        '/lang/devocionales/en.json',
    ],
};
const STAND_DOWN = { type: 'devocionales-stand-down' };
const JS = { type: 'basic', contentType: 'text/javascript' }; // how the site serves its own scripts
const PRIVACY_URL = `${ORIGIN}/devocionales/privacy-policy.html`;
const CONFIG_URL = `${ORIGIN}/devocionales/js/devotional-pwa-config.js`;
const STATS_URL = `${ORIGIN}/data/app-stats.json`;
const imageUrl = (n) => `https://${DATA_HOST}/develop4God/Devocionales-assets/main/images/devotionals/hero_0${n}.jpg`;

const urlOf = (request) => (typeof request === 'string' ? request : request.url);

class FakeCache {
    constructor() {
        this.entries = new Map();
    }
    async match(request, options = {}) {
        const wanted = new URL(urlOf(request));
        for (const [key, response] of this.entries) {
            const candidate = new URL(key);
            if (options.ignoreSearch) candidate.search = wanted.search = '';
            if (candidate.href === wanted.href) return response.clone();
        }
        return undefined;
    }
    async put(request, response) {
        if (this.owner.putDelayMs) await new Promise((resolve) => setTimeout(resolve, this.owner.putDelayMs));
        if (this.owner.failPuts) throw new Error('QuotaExceededError');
        this.entries.set(urlOf(request), response);
    }
    async delete(request) {
        return this.entries.delete(urlOf(request));
    }
    async keys() {
        return [...this.entries.keys()].map((url) => ({ url }));
    }
}

class FakeCaches {
    constructor(fetchImpl) {
        this.stores = new Map();
        this.fetchImpl = fetchImpl;
    }
    async open(name) {
        if (!this.stores.has(name)) {
            const cache = new FakeCache();
            cache.fetch = this.fetchImpl;
            cache.owner = this; // read at call time: tests flip failPuts / putDelayMs on `caches`
            this.stores.set(name, cache);
        }
        return this.stores.get(name);
    }
    async has(name) {
        return this.stores.has(name);
    }
    async keys() {
        return [...this.stores.keys()];
    }
    async delete(name) {
        return this.stores.delete(name);
    }
}

// A real Response whose `type` reads as the given value (Response.type is read-only).
// `contentType` defaults to JSON because most of what the worker saves is data.
function response(body, { status = 200, type = 'cors', contentType = 'application/json', redirected = false } = {}) {
    const decorate = (r) => {
        Object.defineProperty(r, 'type', { value: type, configurable: true });
        // A real redirected response reports redirected === true, which `new Response` cannot set.
        Object.defineProperty(r, 'redirected', { value: redirected, configurable: true });
        const clone = r.clone.bind(r);
        r.clone = () => decorate(clone()); // a real clone keeps both
        return r;
    };
    return decorate(new Response(body, { status, headers: { 'content-type': contentType } }));
}

function loadWorker({ routes = {}, config = CONFIG, preexisting = [] } = {}) {
    const calls = [];
    const requests = [];
    const net = { offline: false };
    const fetchImpl = async (request) => {
        const url = urlOf(request);
        calls.push(url);
        requests.push(request);
        if (net.offline) throw new TypeError('Failed to fetch');
        const route = routes[url];
        if (!route) return response('', { status: 404, type: 'basic' });
        let result;
        if (typeof route === 'function') {
            result = await route(request);
        } else {
            // clone() drops the `type` override, so carry it over: the worker must see what a real
            // browser reports for this response.
            result = route.clone();
            Object.defineProperty(result, 'type', { value: route.type, configurable: true });
        }
        // A browser reports a same-origin response as `basic`, never `cors`.
        if (url.startsWith(ORIGIN) && result.type === 'cors') Object.defineProperty(result, 'type', { value: 'basic', configurable: true });
        return result;
    };
    const caches = new FakeCaches(fetchImpl);
    for (const name of preexisting) caches.stores.set(name, new FakeCache());
    const hasCalls = { count: 0 };
    const realHas = caches.has.bind(caches);
    caches.has = (name) => { hasCalls.count += 1; return realHas(name); };
    const handlers = {};
    const posted = [];
    const spies = { skipWaiting: 0, claim: 0 };
    const self = {
        location: new URL(`${ORIGIN}/devocionales/sw.js`),
        addEventListener: (type, handler) => { handlers[type] = handler; },
        skipWaiting: () => { spies.skipWaiting += 1; return Promise.resolve(); },
        clients: {
            claim: () => { spies.claim += 1; return Promise.resolve(); },
            matchAll: async () => [{ postMessage: (message) => posted.push(message) }],
        },
    };
    const sandbox = { self, caches, fetch: fetchImpl, Request, Response, URL, Promise, setTimeout, clearTimeout, JSON, console };
    vm.runInNewContext(renderSw(TEMPLATE, config), sandbox, { filename: TEMPLATE_PATH });

    const lifecycle = async (type) => {
        let pending;
        handlers[type]({ waitUntil: (promise) => { pending = promise; } });
        await pending;
    };
    const fetchEvent = (url, { method = 'GET', mode = 'cors', headers = {} } = {}) => {
        const event = { request: { url, method, mode, headers: new Headers(headers) }, waits: [], answer: undefined };
        event.respondWith = (promise) => { event.answer = promise; };
        event.waitUntil = (promise) => { event.waits.push(promise); };
        handlers.fetch(event);
        return event;
    };
    const message = (data) => handlers.message({ data });
    return { caches, calls, requests, net, spies, lifecycle, fetchEvent, message, hasCalls, posted };
}

const ALL_ROUTES = () => ({
    [PRIVACY_URL]: response('<html>privacy v1</html>', { type: 'basic' }),
    [CONFIG_URL]: response('config v1', JS),
    [`${ORIGIN}/devocionales/`]: response('<html>shell v1</html>', { type: 'basic' }),
    [`${ORIGIN}/devocionales/vendor/tailwind.css`]: response('css', { type: 'basic' }),
    [`${ORIGIN}/js/shared.js`]: response('js', { type: 'basic' }),
    [`${ORIGIN}/lang/devocionales/en.json`]: response('{}', { type: 'basic' }),
});

async function installed(extra = {}) {
    const worker = loadWorker({ routes: { ...ALL_ROUTES(), ...extra } });
    await worker.lifecycle('install');
    return worker;
}

// ---------------------------------------------------------------------------------- lifecycle

test('install precaches every listed file into the versioned build cache and does not take over open pages', async () => {
    const worker = await installed();
    const cache = await worker.caches.open('devocionales-v1');
    assert.deepEqual(
        [...cache.entries.keys()].sort(),
        CONFIG.precache.map((p) => `${ORIGIN}${p}`).sort(),
    );
    // Taking over would serve pages that run the previous build's scripts from this build.
    assert.equal(worker.spies.skipWaiting, 0);
});

test('install fails, and does not take over, when a precached file cannot be fetched', async () => {
    const routes = ALL_ROUTES();
    delete routes[`${ORIGIN}/js/shared.js`];
    const worker = loadWorker({ routes });
    await assert.rejects(worker.lifecycle('install'));
    assert.equal(worker.spies.skipWaiting, 0);
});

test('install fails while offline, so a broken build is never activated', async () => {
    const worker = loadWorker({ routes: ALL_ROUTES() });
    worker.net.offline = true;
    await assert.rejects(worker.lifecycle('install'));
    assert.equal(worker.spies.skipWaiting, 0);
});

test('activate deletes older build caches but keeps the current build, the data cache and foreign caches', async () => {
    const worker = await installed();
    for (const name of ['devocionales-v0', 'devocionales-data', 'devocionales-images', 'other-app-cache']) await worker.caches.open(name);
    await worker.lifecycle('activate');
    assert.deepEqual((await worker.caches.keys()).sort(), ['devocionales-data', 'devocionales-images', 'devocionales-v1', 'other-app-cache']);
    assert.equal(worker.spies.claim, 0);
});

// ------------------------------------------------------------------------------- shell + assets

test('the shell is served from the build cache, query string ignored, without touching the network', async () => {
    const worker = await installed();
    worker.calls.length = 0;
    const event = worker.fetchEvent(`${ORIGIN}/devocionales/?lang=es&source=pwa`, { mode: 'navigate' });
    assert.equal(await (await event.answer).text(), '<html>shell v1</html>');
    assert.deepEqual(worker.calls, []);
});

test('the shell still opens offline', async () => {
    const worker = await installed();
    worker.net.offline = true;
    const event = worker.fetchEvent(`${ORIGIN}/devocionales/`, { mode: 'navigate' });
    assert.equal(await (await event.answer).text(), '<html>shell v1</html>');
});

test('the shell is also served when opened as /devocionales/index.html', async () => {
    const worker = await installed();
    worker.net.offline = true;
    const event = worker.fetchEvent(`${ORIGIN}/devocionales/index.html`, { mode: 'navigate' });
    assert.equal(await (await event.answer).text(), '<html>shell v1</html>');
});

test('a plain (non-navigation) request for the shell URL is left to the browser', async () => {
    const worker = await installed();
    assert.equal(worker.fetchEvent(`${ORIGIN}/devocionales/`).answer, undefined);
});

test('precached assets are served from cache, offline too', async () => {
    const worker = await installed();
    worker.net.offline = true;
    for (const [url, body] of [[`${ORIGIN}/devocionales/vendor/tailwind.css`, 'css'], [`${ORIGIN}/js/shared.js?v=2`, 'js']]) {
        assert.equal(await (await worker.fetchEvent(url).answer).text(), body);
    }
});

test('requests the worker does not own are left to the browser', async () => {
    const worker = await installed();
    const untouched = [
        worker.fetchEvent(`${ORIGIN}/habitus/`, { mode: 'navigate' }),
        worker.fetchEvent(`${ORIGIN}/devocionales/some-unlisted-page.html`, { mode: 'navigate' }),
        worker.fetchEvent(`${ORIGIN}/devocionales`, { mode: 'navigate' }),
        worker.fetchEvent('https://www.googletagmanager.com/gtag/js?id=X'),
        worker.fetchEvent(`https://${DATA_HOST}/other/repo/file.json`),
        worker.fetchEvent(`https://${DATA_HOST}/develop4God/Devocionales-assets/main/audio/prayer.mp3`),
        worker.fetchEvent(`${ORIGIN}/devocionales/`, { method: 'POST' }),
        worker.fetchEvent(`${ORIGIN}/js/shared.js`, { headers: { range: 'bytes=0-9' } }),
    ];
    assert.deepEqual(untouched.map((event) => event.answer), untouched.map(() => undefined));
});

// ------------------------------------------------------------------------------ remote data
// Year files and index.json share one strategy: network first, saved copy as the fallback.

const DATA_URLS = [
    ['year file', YEAR_URL],
    ['index.json', INDEX_URL],
    ['hero-image index', ASSETS_URL],
    ['app stats (same origin)', STATS_URL],
];
const yearUrl = (n) => `https://${DATA_HOST}/develop4God/Devocionales-json/refs/heads/main/Devocional_year_${2020 + n}.json`;

// Asks the worker for `url`, reads the answer, and waits for the background cache write.
async function ask(worker, url) {
    const event = worker.fetchEvent(url);
    const answer = await event.answer;
    const text = await answer.text();
    await Promise.all(event.waits);
    return text;
}

const savedText = async (worker, url) => {
    const entry = await (await worker.caches.open('devocionales-data')).match(url);
    return entry ? entry.text() : undefined;
};

for (const [name, url] of DATA_URLS) {
    test(`${name}: the network answer is served, saved, and served again with no network`, async () => {
        const worker = await installed({ [url]: response('{"n":1}') });
        assert.equal(await ask(worker, url), '{"n":1}');
        worker.net.offline = true;
        assert.equal(await ask(worker, url), '{"n":1}');
    });

    test(`${name}: fresh content wins whenever the network answers`, async () => {
        let body = '{"v":1}';
        const worker = await installed({ [url]: () => response(body) });
        assert.equal(await ask(worker, url), '{"v":1}');
        body = '{"v":2}';
        assert.equal(await ask(worker, url), '{"v":2}');
        assert.equal(await savedText(worker, url), '{"v":2}');
    });

    test(`${name}: falls back to the saved copy when the network is slow, and still refreshes it`, async () => {
        let slow = false;
        const route = () => (slow
            ? new Promise((resolve) => setTimeout(() => resolve(response('{"new":true}')), 150))
            : response('{"saved":true}'));
        const worker = await installed({ [url]: route });
        await ask(worker, url);
        slow = true;
        assert.equal(await ask(worker, url), '{"saved":true}');
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(await savedText(worker, url), '{"new":true}');
    });

    test(`${name}: falls back to the saved copy when the network fails`, async () => {
        const worker = await installed({ [url]: response('{"saved":true}') });
        await ask(worker, url);
        worker.net.offline = true;
        assert.equal(await ask(worker, url), '{"saved":true}');
    });

    for (const status of [404, 429]) {
        test(`${name}: a ${status} answer is returned live, not masked by the saved copy, and not saved`, async () => {
            let failing = false;
            const route = () => (failing ? response('nope', { status }) : response('{"saved":true}'));
            const worker = await installed({ [url]: route });
            await ask(worker, url);
            failing = true;
            const event = worker.fetchEvent(url);
            const answer = await event.answer;
            assert.equal(answer.status, status);
            assert.equal(await answer.text(), 'nope');
            await Promise.all(event.waits);
            assert.equal(await savedText(worker, url), '{"saved":true}');
        });
    }

    for (const status of [500, 503]) {
        test(`${name}: a ${status} answer does not replace the saved copy`, async () => {
            let failing = false;
            const route = () => (failing ? response('nope', { status }) : response('{"saved":true}'));
            const worker = await installed({ [url]: route });
            await ask(worker, url);
            failing = true;
            assert.equal(await ask(worker, url), '{"saved":true}');
        });
    }

    test(`${name}: with nothing saved and no network it is a network error, never invented content`, async () => {
        const worker = await installed();
        worker.net.offline = true;
        const answer = await worker.fetchEvent(url).answer;
        assert.equal(answer.type, 'error');
    });

    test(`${name}: a 404 with nothing saved is passed through (the loader probes for years that may not exist)`, async () => {
        const worker = await installed({ [url]: response('missing', { status: 404 }) });
        const answer = await worker.fetchEvent(url).answer;
        assert.equal(answer.status, 404);
    });
}

test('a worker told to stand down (the PWA kill switch left its marker) goes network-only and creates no cache', async () => {
    const worker = await installed({ [YEAR_URL]: response('{"n":1}') });
    await worker.caches.open('devocionales-disabled'); // what DevotionalSwRegister.disable() leaves behind
    worker.message(STAND_DOWN); // ...and tells the running worker

    const shell = worker.fetchEvent(`${ORIGIN}/devocionales/`, { mode: 'navigate' });
    assert.equal(await (await shell.answer).text(), '<html>shell v1</html>'); // from the network now
    worker.calls.length = 0;
    assert.equal(await (await worker.fetchEvent(`${ORIGIN}/js/shared.js`).answer).text(), 'js');
    assert.deepEqual(worker.calls, [`${ORIGIN}/js/shared.js`], 'it must go to the network, not the build cache');
    assert.equal(await ask(worker, YEAR_URL), '{"n":1}');

    // Nothing was added: only the build cache from install and the marker.
    assert.deepEqual((await worker.caches.keys()).sort(), ['devocionales-disabled', 'devocionales-v1']);
});

test('an evicted build cache is not mistaken for the kill switch: the worker keeps working and saving data', async () => {
    const worker = await installed({ [YEAR_URL]: response('{"n":1}') });
    await worker.caches.delete('devocionales-v1'); // the browser evicted it under storage pressure
    const shell = worker.fetchEvent(`${ORIGIN}/devocionales/`, { mode: 'navigate' });
    assert.equal(await (await shell.answer).text(), '<html>shell v1</html>'); // network fallback
    assert.equal(await ask(worker, YEAR_URL), '{"n":1}');
    assert.equal(await savedText(worker, YEAR_URL), '{"n":1}'); // still saving
});

test('a newer worker clears the stand-down marker when it activates, so re-enabling the PWA works', async () => {
    const worker = await installed();
    await worker.caches.open('devocionales-disabled');
    await worker.lifecycle('activate');
    assert.deepEqual((await worker.caches.keys()).sort(), ['devocionales-v1']);
});

test('the cache prefix is the same in the worker and in the page script that disables it', () => {
    const prefixIn = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').match(/CACHE_PREFIX = '([^']+)'/)[1];
    assert.equal(prefixIn('../devocionales/js/devotional-sw-register.js'), prefixIn('sw.template.js'));
});

test('opaque and error responses are never saved', async () => {
    for (const bad of [response('x', { type: 'opaque', status: 200 }), response('missing', { status: 404 }), response('boom', { status: 500 })]) {
        const worker = await installed({ [YEAR_URL]: bad });
        await ask(worker, YEAR_URL);
        const data = await worker.caches.open('devocionales-data');
        assert.equal(data.entries.size, 0);
    }
});

test('a cache that cannot be written never breaks online reading', async () => {
    const worker = await installed({ [YEAR_URL]: response('{"ok":true}') });
    worker.caches.failPuts = true; // quota exceeded, eviction error...
    assert.equal(await ask(worker, YEAR_URL), '{"ok":true}');
});

test('the answer is not held back by a slow cache write', async () => {
    const worker = await installed({ [YEAR_URL]: response('{"ok":true}') });
    worker.caches.putDelayMs = 300;
    const started = Date.now();
    const event = worker.fetchEvent(YEAR_URL);
    assert.equal(await (await event.answer).text(), '{"ok":true}');
    assert.ok(Date.now() - started < 200, 'the response waited for the cache write');
    await Promise.all(event.waits);
    assert.equal(await savedText(worker, YEAR_URL), '{"ok":true}');
});

test('the data cache keeps the newest year files, and never evicts the index or the stats', async () => {
    const urls = [1, 2, 3, 4, 5].map(yearUrl);
    const worker = await installed({
        [INDEX_URL]: response('{"index":true}'),
        [STATS_URL]: response('{"stats":true}'),
        ...Object.fromEntries(urls.map((u) => [u, response(u)])),
    });
    await ask(worker, INDEX_URL);
    await ask(worker, STATS_URL);
    for (const u of urls) await ask(worker, u);
    const data = await worker.caches.open('devocionales-data');
    assert.deepEqual([...data.entries.keys()], [INDEX_URL, STATS_URL, ...urls.slice(-3)]);
});

// ------------------------------------------------------------------------ other pages offline

test('the legal pages open offline, from the build cache', async () => {
    const worker = await installed();
    worker.net.offline = true;
    const event = worker.fetchEvent(PRIVACY_URL, { mode: 'navigate' });
    assert.equal(await (await event.answer).text(), '<html>privacy v1</html>');
});

test('a page that is not listed is left to the browser', async () => {
    const worker = await installed();
    assert.equal(worker.fetchEvent(`${ORIGIN}/devocionales/terms-and-conditions.html`, { mode: 'navigate' }).answer, undefined);
});

// ------------------------------------------------------------- config: fresh first, then saved

test('the config script is fetched fresh, bypassing the HTTP cache, so a switch-off is seen at once', async () => {
    let body = 'config v1';
    const worker = await installed({ [CONFIG_URL]: () => response(body, JS) });
    body = 'config v2 (disabled)';
    worker.requests.length = 0;
    assert.equal(await (await worker.fetchEvent(CONFIG_URL).answer).text(), 'config v2 (disabled)');
    assert.equal(worker.requests[0].cache, 'no-cache');
});

test('the config script falls back to the build copy when the network fails, is slow, or errors', async () => {
    // 'portal': a captive portal answers 200 with an HTML page, which must not be run as the config.
    for (const how of ['offline', 'slow', 'error', 'portal']) {
        let mode = 'ok';
        const route = () => {
            if (mode === 'slow') return new Promise((resolve) => setTimeout(() => resolve(response('late', JS)), 150));
            if (mode === 'error') return response('boom', { ...JS, status: 503 });
            if (mode === 'portal') return response('<html>Sign in to the Wi-Fi</html>', { ...JS, contentType: 'text/html' });
            return response('config v1', JS);
        };
        const worker = await installed({ [CONFIG_URL]: route });
        if (how === 'offline') worker.net.offline = true;
        else mode = how;
        assert.equal(await (await worker.fetchEvent(CONFIG_URL).answer).text(), 'config v1', how);
    }
});

test('the config fetch waits only freshTimeoutMs, because the page blocks on it', async () => {
    let calls = 0;
    // The first call is the install; later ones take 30 ms: slower than freshTimeoutMs (20),
    // faster than timeoutMs (40), so only the short wait falls back to the build copy.
    const route = () => (++calls === 1
        ? response('config v1', JS)
        : new Promise((resolve) => setTimeout(() => resolve(response('late', JS)), 30)));
    const worker = await installed({ [CONFIG_URL]: route });
    assert.equal(await (await worker.fetchEvent(CONFIG_URL).answer).text(), 'config v1');
});

test('a stood-down worker still revalidates the config script, so switching back on is not held up by the HTTP cache', async () => {
    const worker = await installed();
    await worker.caches.open('devocionales-disabled');
    worker.message(STAND_DOWN);
    worker.requests.length = 0;
    await worker.fetchEvent(CONFIG_URL).answer;
    assert.equal(worker.requests.at(-1).cache, 'no-cache');
});

test('the legal pages also open offline through their extensionless URL, which the host redirects to', async () => {
    const worker = await installed();
    worker.net.offline = true;
    const event = worker.fetchEvent(`${ORIGIN}/devocionales/privacy-policy`, { mode: 'navigate' });
    assert.equal(await (await event.answer).text(), '<html>privacy v1</html>');
});

test('an extensionless URL of a page that is not listed is left to the browser', async () => {
    const worker = await installed();
    assert.equal(worker.fetchEvent(`${ORIGIN}/devocionales/terms-and-conditions`, { mode: 'navigate' }).answer, undefined);
});

// ---------------------------------------------------------------------------- hero images

test('a hero image is fetched with CORS (so it can be saved), saved, and served with no network', async () => {
    const worker = await installed({ [imageUrl(1)]: response('IMG1') });
    const event = worker.fetchEvent(imageUrl(1), { mode: 'no-cors' }); // what an <img> sends
    assert.equal(await (await event.answer).text(), 'IMG1');
    await Promise.all(event.waits);
    assert.equal(worker.requests.at(-1).mode, 'cors');
    worker.net.offline = true;
    assert.equal(await (await worker.fetchEvent(imageUrl(1), { mode: 'no-cors' }).answer).text(), 'IMG1');
});

test('a saved hero image is served without touching the network', async () => {
    const worker = await installed({ [imageUrl(1)]: response('IMG1') });
    const first = worker.fetchEvent(imageUrl(1), { mode: 'no-cors' });
    await first.answer;
    await Promise.all(first.waits);
    worker.calls.length = 0;
    assert.equal(await (await worker.fetchEvent(imageUrl(1), { mode: 'no-cors' }).answer).text(), 'IMG1');
    assert.deepEqual(worker.calls, []);
});

test('the image cache keeps only the newest images and leaves the data cache alone', async () => {
    const urls = [1, 2, 3, 4, 5].map(imageUrl);
    const worker = await installed({ ...Object.fromEntries(urls.map((u) => [u, response(u)])), [YEAR_URL]: response('{"y":1}') });
    await ask(worker, YEAR_URL);
    for (const u of urls) {
        const event = worker.fetchEvent(u, { mode: 'no-cors' });
        await event.answer;
        await Promise.all(event.waits);
    }
    const images = await worker.caches.open('devocionales-images');
    assert.deepEqual([...images.entries.keys()], urls.slice(-3));
    assert.deepEqual([...(await worker.caches.open('devocionales-data')).entries.keys()], [YEAR_URL]);
});

test('a hero image whose CORS fetch fails still loads through the original request, unsaved', async () => {
    const route = (request) => {
        if (request.mode === 'cors') throw new TypeError('blocked by CORS');
        return response('IMG-opaque', { type: 'opaque' });
    };
    const worker = await installed({ [imageUrl(1)]: route });
    const event = worker.fetchEvent(imageUrl(1), { mode: 'no-cors' });
    assert.equal(await (await event.answer).text(), 'IMG-opaque');
    await Promise.all(event.waits);
    assert.equal((await worker.caches.open('devocionales-images')).entries.size, 0);
});

test('a same-origin answer that is not JSON (a captive-portal page) is not saved as app stats', async () => {
    const worker = await installed({ [STATS_URL]: response('<html>Sign in</html>', { type: 'basic', contentType: 'text/html' }) });
    const event = worker.fetchEvent(STATS_URL);
    await event.answer;
    await Promise.all(event.waits);
    assert.equal((await worker.caches.open('devocionales-data')).entries.size, 0);
});

test('a missing hero image (404) is passed through and not saved; with no network and nothing saved it is a network error', async () => {
    const worker = await installed({ [imageUrl(9)]: response('gone', { status: 404 }) });
    const missing = worker.fetchEvent(imageUrl(9), { mode: 'no-cors' });
    assert.equal((await missing.answer).status, 404);
    await Promise.all(missing.waits);
    assert.equal((await worker.caches.open('devocionales-images')).entries.size, 0);
    worker.net.offline = true;
    await assert.rejects(worker.fetchEvent(imageUrl(1), { mode: 'no-cors' }).answer);
});

test('a hero image that cannot be saved still displays', async () => {
    const worker = await installed({ [imageUrl(1)]: response('IMG1') });
    worker.caches.failPuts = true;
    const event = worker.fetchEvent(imageUrl(1), { mode: 'no-cors' });
    assert.equal(await (await event.answer).text(), 'IMG1');
    await Promise.all(event.waits);
});

test('a stood-down worker leaves hero images to the network and creates no image cache', async () => {
    const worker = await installed({ [imageUrl(1)]: response('IMG1') });
    await worker.caches.open('devocionales-disabled');
    worker.message(STAND_DOWN);
    assert.equal(await (await worker.fetchEvent(imageUrl(1), { mode: 'no-cors' }).answer).text(), 'IMG1');
    assert.equal((await worker.caches.keys()).includes('devocionales-images'), false);
});

// --------------------------------------------------------- install while switched off

test('a worker refuses to install while the PWA is switched off, and creates no build cache', async () => {
    const worker = loadWorker({ routes: ALL_ROUTES() });
    await worker.caches.open('devocionales-disabled');
    await assert.rejects(worker.lifecycle('install'), /switched off/);
    assert.equal(worker.spies.skipWaiting, 0);
    assert.deepEqual(await worker.caches.keys(), ['devocionales-disabled']);
});


// ------------------------------------------------------------ review fixes: clean copies

test('a redirected response (the host 308s *.html) is precached as a clean, non-redirected copy', async () => {
    const worker = await installed({
        [PRIVACY_URL]: () => response('<html>privacy v1</html>', { type: 'basic', contentType: 'text/html', redirected: true }),
    });
    const stored = (await worker.caches.open('devocionales-v1')).entries.get(PRIVACY_URL);
    assert.equal(stored.redirected, false, 'browsers reject a redirected response served to a navigation');
    assert.equal(await stored.text(), '<html>privacy v1</html>');
    assert.equal(stored.headers.get('content-type'), 'text/html');
    assert.equal(stored.status, 200);
});

test('saved data and images are clean copies too', async () => {
    const worker = await installed({
        [YEAR_URL]: () => response('{"n":1}', { redirected: true }),
        [imageUrl(1)]: () => response('IMG1', { redirected: true }),
    });
    await ask(worker, YEAR_URL);
    const image = worker.fetchEvent(imageUrl(1), { mode: 'no-cors' });
    await image.answer;
    await Promise.all(image.waits);
    const data = (await worker.caches.open('devocionales-data')).entries.get(YEAR_URL);
    const img = (await worker.caches.open('devocionales-images')).entries.get(imageUrl(1));
    assert.equal(data.redirected, false);
    assert.equal(img.redirected, false);
    assert.equal(await data.text(), '{"n":1}');
});

// ------------------------------------------------------------ review fixes: install retries

test('install retries a file that fails transiently and still completes', async () => {
    let calls = 0;
    const worker = loadWorker({
        routes: { ...ALL_ROUTES(), [`${ORIGIN}/js/shared.js`]: () => (++calls < 3 ? response('', { status: 503, type: 'basic' }) : response('js', { type: 'basic' })) },
    });
    await worker.lifecycle('install');
    assert.equal(calls, 3);
    assert.equal((await worker.caches.open('devocionales-v1')).entries.size, CONFIG.precache.length);
});

test('install gives up after the bounded attempts, removes the half-built cache and signals which file failed', async () => {
    let calls = 0;
    const worker = loadWorker({
        routes: { ...ALL_ROUTES(), [`${ORIGIN}/js/shared.js`]: () => { calls += 1; return response('', { status: 503, type: 'basic' }); } },
    });
    await assert.rejects(worker.lifecycle('install'));
    assert.equal(calls, CONFIG.installAttempts);
    assert.equal(worker.spies.skipWaiting, 0);
    assert.equal(await worker.caches.has('devocionales-v1'), false, 'a build cache is all or nothing');
    assert.deepEqual(JSON.parse(JSON.stringify(worker.posted)), [{ type: 'devocionales-install-failed', version: 'v1', urls: [`${ORIGIN}/js/shared.js`] }]);
});

test('a failed install that cannot notify any page still rejects', async () => {
    const routes = ALL_ROUTES();
    delete routes[`${ORIGIN}/js/shared.js`];
    const worker = loadWorker({ routes });
    worker.posted.push = () => { throw new Error('no clients'); };
    await assert.rejects(worker.lifecycle('install'), /shared\.js/);
});

// ------------------------------------------------------------ review fixes: stand-down flag

test('the stand-down state is a worker flag: requests never query the Cache API for it', async () => {
    const worker = await installed({ [YEAR_URL]: response('{"n":1}') });
    await ask(worker, YEAR_URL);
    const before = worker.hasCalls.count;
    for (let i = 0; i < 5; i += 1) await ask(worker, YEAR_URL);
    await (await worker.fetchEvent(`${ORIGIN}/js/shared.js`).answer).text();
    assert.equal(worker.hasCalls.count, before);
});

test('a marker left by an earlier switch-off is honoured when the worker starts', async () => {
    const worker = loadWorker({ routes: ALL_ROUTES(), preexisting: ['devocionales-disabled'] });
    worker.calls.length = 0;
    assert.equal(await (await worker.fetchEvent(`${ORIGIN}/js/shared.js`).answer).text(), 'js');
    assert.deepEqual(worker.calls, [`${ORIGIN}/js/shared.js`]);
});

test('activation clears the stand-down flag together with the marker', async () => {
    const worker = await installed();
    await worker.caches.open('devocionales-disabled');
    worker.message(STAND_DOWN);
    await worker.lifecycle('activate');
    worker.net.offline = true;
    assert.equal(await (await worker.fetchEvent(`${ORIGIN}/js/shared.js`).answer).text(), 'js'); // from the build cache again
});

test('an unrelated message does not stand the worker down', async () => {
    const worker = await installed();
    for (const data of [{ type: 'other' }, 'devocionales-stand-down', null, undefined, {}]) worker.message(data);
    worker.net.offline = true;
    assert.equal(await (await worker.fetchEvent(`${ORIGIN}/js/shared.js`).answer).text(), 'js');
});

test('the stand-down message type is the same in the worker and in the page script that sends it', () => {
    const typeIn = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').match(/STAND_DOWN_MESSAGE = '([^']+)'/)[1];
    assert.equal(typeIn('../devocionales/js/devotional-sw-register.js'), typeIn('sw.template.js'));
});

test('a save still in flight when the worker is told to stand down is dropped, so the sweep is not undone', async () => {
    const worker = await installed({
        [YEAR_URL]: () => new Promise((resolve) => setTimeout(() => resolve(response('{"n":1}')), 15)),
        [imageUrl(1)]: () => new Promise((resolve) => setTimeout(() => resolve(response('IMG1')), 15)),
    });
    const data = worker.fetchEvent(YEAR_URL);
    const image = worker.fetchEvent(imageUrl(1), { mode: 'no-cors' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    worker.message(STAND_DOWN); // the page's kill switch, while both requests are on the network
    await data.answer;
    await image.answer;
    await Promise.all([...data.waits, ...image.waits]);
    assert.equal((await worker.caches.keys()).includes('devocionales-data'), false);
    // Looking the image up opened its cache before the message; nothing may have been put in it.
    assert.equal((await worker.caches.open('devocionales-images')).entries.size, 0);
});

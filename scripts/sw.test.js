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
const IMAGE_URL = `https://${DATA_HOST}/develop4God/Devocionales-assets/main/images/devotionals/hero_01.jpg`;

const CONFIG = {
    version: 'v1',
    timeoutMs: 40,
    maxDataEntries: 3,
    dataHost: DATA_HOST,
    dataPathPrefixes: [
        '/develop4God/Devocionales-json/',
        '/develop4God/Devocionales-assets/main/images/devotionals/index.json',
    ],
    precache: ['/devocionales/', '/devocionales/vendor/tailwind.css', '/js/shared.js', '/lang/devocionales/en.json'],
};

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
    async addAll(requests) {
        const responses = await Promise.all(requests.map((request) => this.fetch(request)));
        responses.forEach((response, index) => {
            if (!response.ok) throw new TypeError(`addAll: ${response.status} for ${urlOf(requests[index])}`);
        });
        requests.forEach((request, index) => this.entries.set(urlOf(request), responses[index]));
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
    async keys() {
        return [...this.stores.keys()];
    }
    async delete(name) {
        return this.stores.delete(name);
    }
}

// A real Response whose `type` reads as the given value (Response.type is read-only).
function response(body, { status = 200, type = 'cors' } = {}) {
    const r = new Response(body, { status });
    Object.defineProperty(r, 'type', { value: type });
    return r;
}

function loadWorker({ routes = {}, config = CONFIG } = {}) {
    const calls = [];
    const net = { offline: false };
    const fetchImpl = async (request) => {
        const url = urlOf(request);
        calls.push(url);
        if (net.offline) throw new TypeError('Failed to fetch');
        const route = routes[url];
        if (!route) return response('', { status: 404, type: 'basic' });
        if (typeof route === 'function') return route();
        // clone() drops the `type` override, so carry it over: the worker must see what a real
        // browser reports for this response.
        const copy = route.clone();
        Object.defineProperty(copy, 'type', { value: route.type });
        return copy;
    };
    const caches = new FakeCaches(fetchImpl);
    const handlers = {};
    const spies = { skipWaiting: 0, claim: 0 };
    const self = {
        location: new URL(`${ORIGIN}/devocionales/sw.js`),
        addEventListener: (type, handler) => { handlers[type] = handler; },
        skipWaiting: () => { spies.skipWaiting += 1; return Promise.resolve(); },
        clients: { claim: () => { spies.claim += 1; return Promise.resolve(); } },
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
    return { caches, calls, net, spies, lifecycle, fetchEvent };
}

const ALL_ROUTES = () => ({
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

test('install precaches every listed file into the versioned build cache and takes over at once', async () => {
    const worker = await installed();
    const cache = await worker.caches.open('devocionales-v1');
    assert.deepEqual(
        [...cache.entries.keys()].sort(),
        CONFIG.precache.map((p) => `${ORIGIN}${p}`).sort(),
    );
    assert.equal(worker.spies.skipWaiting, 1);
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
    for (const name of ['devocionales-v0', 'devocionales-data', 'other-app-cache']) await worker.caches.open(name);
    await worker.lifecycle('activate');
    assert.deepEqual((await worker.caches.keys()).sort(), ['devocionales-data', 'devocionales-v1', 'other-app-cache']);
    assert.equal(worker.spies.claim, 1);
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
        worker.fetchEvent(`${ORIGIN}/devocionales/privacy-policy.html`, { mode: 'navigate' }),
        worker.fetchEvent(`${ORIGIN}/devocionales`, { mode: 'navigate' }),
        worker.fetchEvent('https://www.googletagmanager.com/gtag/js?id=X'),
        worker.fetchEvent(`https://${DATA_HOST}/other/repo/file.json`),
        worker.fetchEvent(IMAGE_URL),
        worker.fetchEvent(`${ORIGIN}/devocionales/`, { method: 'POST' }),
        worker.fetchEvent(`${ORIGIN}/js/shared.js`, { headers: { range: 'bytes=0-9' } }),
    ];
    assert.deepEqual(untouched.map((event) => event.answer), untouched.map(() => undefined));
});

// ------------------------------------------------------------------------------ remote data
// Year files and index.json share one strategy: network first, saved copy as the fallback.

const DATA_URLS = [['year file', YEAR_URL], ['index.json', INDEX_URL], ['hero-image index', ASSETS_URL]];
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

    for (const status of [404, 429, 500, 503]) {
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

test('the data cache keeps the newest year files, and never evicts index.json', async () => {
    const urls = [1, 2, 3, 4, 5].map(yearUrl);
    const worker = await installed({ [INDEX_URL]: response('{"index":true}'), ...Object.fromEntries(urls.map((u) => [u, response(u)])) });
    await ask(worker, INDEX_URL);
    for (const u of urls) await ask(worker, u);
    const data = await worker.caches.open('devocionales-data');
    assert.deepEqual([...data.entries.keys()], [INDEX_URL, ...urls.slice(-3)]);
});

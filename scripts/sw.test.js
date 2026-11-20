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
const PUSH_SOURCE = fs.readFileSync(path.join(__dirname, 'sw-push.js'), 'utf8');
const ORIGIN = 'http://localhost';
const DATA_HOST = 'raw.githubusercontent.com';
const YEAR_URL = `https://${DATA_HOST}/develop4God/Devocionales-json/refs/heads/main/Devocional_year_2026.json`;
const INDEX_URL = `https://${DATA_HOST}/develop4God/Devocionales-json/refs/heads/main/index.json`;
const ASSETS_URL = `https://${DATA_HOST}/develop4God/Devocionales-assets/main/images/devotionals/index.json`;

const CONFIG = {
    version: 'v1',
    claimTimeoutMs: 30,
    timeoutMs: 40,
    freshTimeoutMs: 20, // the page blocks on the config script, so its wait is shorter than the data wait
    maxDataEntries: 3,
    maxStudyEntries: 2,
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
    pages: ['/devocionales/privacy-policy.html', '/devocionales/estudios/index.html'],
    precache: [
        '/devocionales/',
        '/devocionales/privacy-policy.html',
        '/devocionales/estudios/index.html',
        '/devocionales/vendor/tailwind.css',
        '/devocionales/js/devotional-pwa-config.js',
        '/js/shared.js',
        '/lang/devocionales/en.json',
    ],
};
const SKIP_WAITING = { type: 'devocionales-skip-waiting' };
// What the page's kill switch (DevotionalSwRegister.disable) leaves behind: the marker, and every
// other devocionales-* cache deleted.
async function killSwitch(worker) {
  await worker.caches.open('devocionales-disabled');
  for (const name of await worker.caches.keys()) if (name !== 'devocionales-disabled' && name.startsWith('devocionales-')) await worker.caches.delete(name);
}
const JS = { type: 'basic', contentType: 'text/javascript' }; // how the site serves its own scripts
const PRIVACY_URL = `${ORIGIN}/devocionales/privacy-policy.html`;
const STUDIES_URL = `${ORIGIN}/devocionales/estudios/index.html`;
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
        if (this.openDelayMs) await new Promise((resolve) => setTimeout(resolve, this.openDelayMs));
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
    // Like the real one with cacheName: it reads one cache and never creates it.
    async match(request, options = {}) {
        const store = this.stores.get(options.cacheName);
        return store ? store.match(request, options) : undefined;
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
    const shown = [];
    const windows = [];
    const spies = { skipWaiting: 0, claim: 0 };
    const self = {
        location: new URL(`${ORIGIN}/devocionales/sw.js`),
        registration: { showNotification: (title) => { shown.push(title); return Promise.resolve(); } },
        addEventListener: (type, handler) => { handlers[type] = handler; },
        skipWaiting: () => { spies.skipWaiting += 1; return Promise.resolve(); },
        clients: {
            openWindow: () => Promise.resolve(),
            claim: () => { spies.claim += 1; return Promise.resolve(); },
            matchAll: async () => windows,
        },
    };
    const sandbox = { MessageChannel, self, caches, fetch: fetchImpl, Request, Response, URL, Promise, setTimeout, clearTimeout, JSON, console };
    vm.runInNewContext(renderSw(TEMPLATE, config, PUSH_SOURCE), sandbox, { filename: TEMPLATE_PATH });

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
    const message = async (data, source) => {
        const waits = [];
        handlers.message({ data, source, waitUntil: (promise) => waits.push(promise) });
        await Promise.all(waits);
    };
    return { handlers, shown, caches, calls, requests, net, spies, lifecycle, fetchEvent, message, hasCalls, windows };
}

const ALL_ROUTES = () => ({
    [PRIVACY_URL]: response('<html>privacy v1</html>', { type: 'basic' }),
    [STUDIES_URL]: response('<html>studies v1</html>', { type: 'basic' }),
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

    for (const status of [404, 410]) {
        test(`${name}: a ${status} (the data is really absent) is returned live, not masked by the saved copy, and not saved`, async () => {
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

    for (const status of [403, 408, 429, 500, 503]) {
        test(`${name}: a ${status} answer (rate limit, outage) does not replace the saved copy`, async () => {
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

test('after the kill switch the worker serves from the network and creates no cache', async () => {
    const worker = await installed({ [YEAR_URL]: response('{"n":1}') });
    await killSwitch(worker);

    const shell = worker.fetchEvent(`${ORIGIN}/devocionales/`, { mode: 'navigate' });
    assert.equal(await (await shell.answer).text(), '<html>shell v1</html>'); // from the network now
    worker.calls.length = 0;
    assert.equal(await (await worker.fetchEvent(`${ORIGIN}/js/shared.js`).answer).text(), 'js');
    assert.deepEqual(worker.calls, [`${ORIGIN}/js/shared.js`], 'it must go to the network, not the build cache');
    assert.equal(await ask(worker, YEAR_URL), '{"n":1}');

    // Reading never creates a cache and the guarded save is refused: only the marker is left.
    assert.deepEqual(await worker.caches.keys(), ['devocionales-disabled']);
});
test('an evicted build cache is not mistaken for the kill switch: the worker keeps working and saving data', async () => {
    const worker = await installed({ [YEAR_URL]: response('{"n":1}') });
    await worker.caches.delete('devocionales-v1'); // the browser evicted it under storage pressure
    const shell = worker.fetchEvent(`${ORIGIN}/devocionales/`, { mode: 'navigate' });
    assert.equal(await (await shell.answer).text(), '<html>shell v1</html>'); // network fallback
    assert.equal(await ask(worker, YEAR_URL), '{"n":1}');
    assert.equal(await savedText(worker, YEAR_URL), '{"n":1}'); // still saving
});

test('activation keeps the marker, and a worker saves nothing while it exists', async () => {
    const worker = await installed({ [YEAR_URL]: response('{"n":1}') });
    await worker.caches.open('devocionales-disabled'); // a disable() racing this activation
    await worker.lifecycle('activate');
    assert.equal(await worker.caches.has('devocionales-disabled'), true);
    assert.equal(await ask(worker, YEAR_URL), '{"n":1}');
    assert.equal(await worker.caches.has('devocionales-data'), false, 'nothing refilled');
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

const STUDY_INDEX_URL = 'https://raw.githubusercontent.com/develop4God/Devocionales-json/refs/heads/main/discovery/index.json';
const studyUrl = (n) => `https://raw.githubusercontent.com/develop4God/Devocionales-json/refs/heads/main/discovery/en/study_${n}_en_001.json`;

test('Bible-study files in the data cache are capped (newest kept); the studies index and year files are never evicted by them', async () => {
    const studies = [1, 2, 3, 4].map(studyUrl);
    const years = [1, 2].map(yearUrl);
    const worker = await installed({
        [STUDY_INDEX_URL]: response('{"studies":[]}'),
        ...Object.fromEntries(years.map((u) => [u, response(u)])),
        ...Object.fromEntries(studies.map((u) => [u, response(u)])),
    });
    await ask(worker, STUDY_INDEX_URL);
    for (const u of years) await ask(worker, u);
    for (const u of studies) await ask(worker, u);
    const keys = [...(await worker.caches.open('devocionales-data')).entries.keys()];
    assert.deepEqual(keys.filter((k) => k.includes('/discovery/en/')), studies.slice(-2));
    assert.ok(keys.includes(STUDY_INDEX_URL), 'the studies index is small and every visit needs it');
    for (const u of years) assert.ok(keys.includes(u), 'year files are not counted against the studies');
});

test('a saved study opens offline through the worker', async () => {
    const worker = await installed({ [studyUrl(1)]: response('{"cards":[]}') });
    await ask(worker, studyUrl(1));
    worker.net.offline = true;
    assert.equal(await ask(worker, studyUrl(1)), '{"cards":[]}');
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

// ----------------------------------------------- the Bible-studies page (a folder page) offline

for (const [label, path] of [
    ['its directory URL', '/devocionales/estudios/'],
    ['index.html', '/devocionales/estudios/index.html'],
    ['the slashless URL the host may redirect from', '/devocionales/estudios'],
    ['a deep link with a study id and language in the query', '/devocionales/estudios/?lang=en&id=love'],
]) {
    test(`the studies page opens offline from the build cache through ${label}`, async () => {
        const worker = await installed();
        worker.net.offline = true;
        const event = worker.fetchEvent(`${ORIGIN}${path}`, { mode: 'navigate' });
        assert.equal(await (await event.answer).text(), '<html>studies v1</html>');
    });
}

test('the studies page does not hijack the reader or a folder that is not listed', async () => {
    const worker = await installed();
    worker.net.offline = true;
    assert.equal(await (await worker.fetchEvent(`${ORIGIN}/devocionales/`, { mode: 'navigate' }).answer).text(), '<html>shell v1</html>');
    assert.equal(worker.fetchEvent(`${ORIGIN}/devocionales/other/`, { mode: 'navigate' }).answer, undefined);
    assert.equal(worker.fetchEvent(`${ORIGIN}/devocionales/other`, { mode: 'navigate' }).answer, undefined);
});

test('the studies page is only answered for navigations (the study data and other requests stay with the browser)', async () => {
    const worker = await installed();
    assert.equal(worker.fetchEvent(`${ORIGIN}/devocionales/estudios/missing.json`).answer, undefined);
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

test('after the kill switch the config script is still revalidated, so switching back on is not held up by the HTTP cache', async () => {
    const worker = await installed();
    await killSwitch(worker);
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

test('after the kill switch hero images come from the network and no image cache is created', async () => {
    const worker = await installed({ [imageUrl(1)]: response('IMG1') });
    await killSwitch(worker);
    const event = worker.fetchEvent(imageUrl(1), { mode: 'no-cors' });
    assert.equal(await (await event.answer).text(), 'IMG1');
    await Promise.all(event.waits);
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

test('install gives up after the bounded attempts, removes the half-built cache', async () => {
    let calls = 0;
    const worker = loadWorker({
        routes: { ...ALL_ROUTES(), [`${ORIGIN}/js/shared.js`]: () => { calls += 1; return response('', { status: 503, type: 'basic' }); } },
    });
    await assert.rejects(worker.lifecycle('install'));
    assert.equal(calls, CONFIG.installAttempts);
    assert.equal(worker.spies.skipWaiting, 0);
    assert.equal(await worker.caches.has('devocionales-v1'), false, 'a build cache is all or nothing');
});

// ------------------------------------------------------------ second review: copies

test('a response that was not redirected is stored as it came, not buffered into a copy', async () => {
    const original = response('<html>privacy v1</html>', { type: 'basic', contentType: 'text/html' });
    const worker = await installed({ [PRIVACY_URL]: () => original });
    assert.equal((await worker.caches.open('devocionales-v1')).entries.get(PRIVACY_URL), original);
});

test('a partial (206) or opaque answer is never stored as a complete file', async () => {
    for (const bad of [response('part', { status: 206, type: 'basic' }), response('', { type: 'opaque' })]) {
        const worker = await installed({ [YEAR_URL]: bad, [imageUrl(1)]: bad });
        await ask(worker, YEAR_URL);
        const image = worker.fetchEvent(imageUrl(1), { mode: 'no-cors' });
        await image.answer;
        await Promise.all(image.waits);
        assert.equal((await worker.caches.open('devocionales-data')).entries.size, 0);
        assert.equal((await worker.caches.open('devocionales-images')).entries.size, 0);
    }
    const routes = ALL_ROUTES();
    routes[`${ORIGIN}/js/shared.js`] = response('part', { status: 206, type: 'basic' });
    await assert.rejects(loadWorker({ routes }).lifecycle('install'), /shared\.js/);
});


// ------------------------------------------------------------ kill switch: one guard on every write

test('serving a page or asset never queries the Cache API for the marker', async () => {
    const worker = await installed();
    const before = worker.hasCalls.count;
    for (let i = 0; i < 5; i += 1) {
        await (await worker.fetchEvent(`${ORIGIN}/devocionales/`, { mode: 'navigate' }).answer).text();
        await (await worker.fetchEvent(`${ORIGIN}/js/shared.js`).answer).text();
    }
    assert.equal(worker.hasCalls.count, before);
});

test('a marker that exists when a save starts means nothing is written, with no message needed', async () => {
    const worker = await installed({ [YEAR_URL]: response('{"n":1}'), [imageUrl(1)]: response('IMG1') });
    await worker.caches.open('devocionales-disabled');
    assert.equal(await ask(worker, YEAR_URL), '{"n":1}');
    const image = worker.fetchEvent(imageUrl(1), { mode: 'no-cors' });
    await image.answer;
    await Promise.all(image.waits);
    assert.equal(await worker.caches.has('devocionales-data'), false);
    assert.equal(await worker.caches.has('devocionales-images'), false);
});

test('a save that races the kill switch cannot recreate a swept cache', async () => {
    const worker = await installed({
        [YEAR_URL]: response('{"n":1}'),
        [imageUrl(1)]: response('IMG1'),
    });
    worker.caches.openDelayMs = 30; // the kill switch runs between the marker check and the cache being opened
    const data = worker.fetchEvent(YEAR_URL);
    const image = worker.fetchEvent(imageUrl(1), { mode: 'no-cors' });
    await Promise.all([data.answer, image.answer]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    worker.caches.openDelayMs = 0;
    await killSwitch(worker); // marker first, then the sweep, as disable() does
    await Promise.all([...data.waits, ...image.waits]);
    assert.deepEqual(await worker.caches.keys(), ['devocionales-disabled']);
});

test('an install in progress when the kill switch runs rolls back and leaves no build cache', async () => {
    const slow = () => new Promise((resolve) => setTimeout(() => resolve(response('js', { type: 'basic' })), 40));
    const worker = loadWorker({ routes: { ...ALL_ROUTES(), [`${ORIGIN}/js/shared.js`]: slow } });
    const install = assert.rejects(worker.lifecycle('install'), /switched off/);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await killSwitch(worker);
    await install;
    assert.deepEqual(await worker.caches.keys(), ['devocionales-disabled']);
});

test('an install whose writes are overtaken by the kill switch deletes what it wrote', async () => {
    const worker = loadWorker({ routes: ALL_ROUTES() });
    worker.caches.putDelayMs = 20;
    const install = assert.rejects(worker.lifecycle('install'), /switched off/);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await killSwitch(worker);
    await install;
    assert.deepEqual(await worker.caches.keys(), ['devocionales-disabled']);
});

test('a failed install never leaves a build cache behind', async () => {
    const routes = ALL_ROUTES();
    delete routes[`${ORIGIN}/js/shared.js`];
    const worker = loadWorker({ routes });
    await assert.rejects(worker.lifecycle('install'));
    assert.deepEqual(await worker.caches.keys(), []);
});

test('a marker left by an earlier switch-off is honoured when the worker starts', async () => {
    const worker = loadWorker({ routes: ALL_ROUTES(), preexisting: ['devocionales-disabled'] });
    worker.calls.length = 0;
    assert.equal(await (await worker.fetchEvent(`${ORIGIN}/js/shared.js`).answer).text(), 'js');
    assert.deepEqual(worker.calls, [`${ORIGIN}/js/shared.js`]);
    assert.deepEqual(await worker.caches.keys(), ['devocionales-disabled']);
});

// ------------------------------------------------------------ claiming only pages of this build

// A page window that answers the worker's build question like DevotionalSwRegister does.
const pageOf = (build, visibilityState = 'visible') => ({
    visibilityState,
    postMessage: (message, [port]) => {
        assert.equal(message.type, 'devocionales-build?');
        if (build !== undefined) port.postMessage(build);
    },
});

test('the worker claims when there is no page, or every page runs this build', async () => {
    const empty = await installed();
    await empty.lifecycle('activate');
    assert.equal(empty.spies.claim, 1);

    const same = await installed();
    same.windows.push(pageOf('v1'), pageOf('v1'));
    await same.lifecycle('activate');
    assert.equal(same.spies.claim, 1);
});

test('the worker does not claim when any page runs another build, never answers, or cannot be asked', async () => {
    const cases = {
        'another build': [pageOf('v1'), pageOf('v0')],
        'no answer (a page from before the build stamp, or a legal page)': [pageOf('v1'), pageOf(undefined)],
        'unaskable': [{ visibilityState: 'visible', postMessage: () => { throw new Error('gone'); } }],
    };
    for (const [label, windows] of Object.entries(cases)) {
        const worker = await installed();
        worker.windows.push(...windows);
        await worker.lifecycle('activate');
        assert.equal(worker.spies.claim, 0, label);
    }
});

test('claiming never depends on which caches exist: a swept and re-enabled worker leaves a page of an older build alone', async () => {
    const worker = await installed();
    worker.windows.push(pageOf('v0')); // a tab still running the build from before the kill switch
    await worker.lifecycle('activate');
    assert.equal(worker.spies.claim, 0);
});

// ------------------------------------------------------------ update delivery

test('a page asking the waiting worker to take over is obeyed only when every page is hidden', async () => {
    const hidden = await installed();
    hidden.windows.push(pageOf('v0', 'hidden'), pageOf('v0', 'hidden'));
    await hidden.message(SKIP_WAITING);
    assert.equal(hidden.spies.skipWaiting, 1);

    const oneVisible = await installed();
    oneVisible.windows.push(pageOf('v0', 'hidden'), pageOf('v0', 'visible'));
    await oneVisible.message(SKIP_WAITING);
    assert.equal(oneVisible.spies.skipWaiting, 0, 'a visible page must never get a new build under it');
});

// An entry request comes from a page that has only just loaded and is still the one the reader is
// looking at: it may take over while that page is visible, but never under another visible page.
const ENTRY = { type: 'devocionales-skip-waiting', entry: true };
const sender = { id: 'sender' };

test('an entry request is obeyed when the sender is the only visible page', async () => {
    const alone = await installed();
    alone.windows.push({ ...pageOf('v0', 'visible'), id: 'sender' });
    await alone.message(ENTRY, sender);
    assert.equal(alone.spies.skipWaiting, 1);

    const withHiddenTab = await installed();
    withHiddenTab.windows.push({ ...pageOf('v0', 'visible'), id: 'sender' }, { ...pageOf('v0', 'hidden'), id: 'other' });
    await withHiddenTab.message(ENTRY, sender);
    assert.equal(withHiddenTab.spies.skipWaiting, 1);
});

test('an entry request is refused while another page is visible, and without a known sender', async () => {
    const otherVisible = await installed();
    otherVisible.windows.push({ ...pageOf('v0', 'visible'), id: 'sender' }, { ...pageOf('v0', 'visible'), id: 'other' });
    await otherVisible.message(ENTRY, sender);
    assert.equal(otherVisible.spies.skipWaiting, 0, 'another visible tab must never get a new build under it');

    const noSender = await installed();
    noSender.windows.push({ ...pageOf('v0', 'visible'), id: 'sender' });
    await noSender.message(ENTRY, undefined);
    assert.equal(noSender.spies.skipWaiting, 0, 'without a sender the visible page cannot be excluded');
});

test('a plain request still needs every page hidden, even from a page that sends entry-less messages', async () => {
    const worker = await installed();
    worker.windows.push({ ...pageOf('v0', 'visible'), id: 'sender' });
    await worker.message(SKIP_WAITING, sender);
    assert.equal(worker.spies.skipWaiting, 0);
});

test('other messages do not make the worker take over', async () => {
    const worker = await installed();
    for (const data of [{ type: 'other' }, 'devocionales-skip-waiting', null, undefined, {}]) await worker.message(data);
    assert.equal(worker.spies.skipWaiting, 0);
});

test('the message types are the same in the worker and in the page script', () => {
    const constants = (file) => Object.fromEntries(
        [...fs.readFileSync(path.join(__dirname, file), 'utf8').matchAll(/(SKIP_WAITING_MESSAGE|BUILD_QUERY_MESSAGE) = '([^']+)'/g)].map((m) => [m[1], m[2]]),
    );
    const worker = constants('sw.template.js');
    assert.equal(Object.keys(worker).length, 2);
    assert.deepEqual(constants('../devocionales/js/devotional-sw-register.js'), worker);
});

test('the push handlers ship in the worker next to the existing ones, which stay registered', () => {
    const worker = loadWorker();
    assert.deepEqual(Object.keys(worker.handlers).sort(), ['activate', 'fetch', 'install', 'message', 'notificationclick', 'push']);
});

test('a push event in the full worker shows one notification and touches no cache or network', async () => {
    const worker = loadWorker();
    worker.handlers.push({ data: { json: () => ({ notification: { title: 'T', body: 'B' } }) }, waitUntil: () => {} });
    assert.deepEqual(worker.shown, ['T']);
    assert.equal(worker.requests.length, 0);
    assert.equal((await worker.caches.keys()).length, 0);
});

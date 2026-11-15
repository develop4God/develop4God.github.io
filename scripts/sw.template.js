/* eslint-env serviceworker */
// Service worker for /devocionales/. Generated into devocionales/sw.js by scripts/build-sw.js:
// edit this template, never the generated file.
//
// What it does, by kind of request:
//  - The page shell, the legal pages and every file they load (scripts, styles, fonts, icons,
//    language files) are precached in one cache per build and served from it. HTML and scripts
//    therefore always come from the same build; a deploy reaches readers through a new worker,
//    not through a newer HTML file meeting older cached scripts.
//  - The PWA config script is the one precached file fetched fresh first (bypassing the HTTP
//    cache), so switching the PWA off reaches an online reader on their next visit without
//    waiting for a worker update. The build copy is the fallback.
//  - Devotional data (year files and index.json on raw.githubusercontent.com, the hero-image list
//    the page waits for before it renders, and the same-origin app stats): network first, so a
//    reader online always gets current content. The last good copy is the fallback when the
//    network fails, is slow, or answers with an error, which is what lets a devotional already
//    read open offline. Only complete, CORS-readable responses are saved, and saving happens in
//    the background so a full or failing cache can never delay or break reading.
//  - Hero images: saved on first view and served from the saved copy afterwards. An <img> sends
//    a no-cors request whose response is opaque and unsavable, so the worker fetches the image
//    again with CORS (the host allows it) and answers with that.
//  - Everything else (analytics, other pages, non-GET, Range requests) is left alone.
//
// Caches: `devocionales-<version>` holds one build and is deleted when a newer worker activates;
// `devocionales-data` and `devocionales-images` survive deploys, since remote content is
// independent of the page build. Each keeps only the newest entries (the data cache never evicts
// the small index and stats files).

const CONFIG = JSON.parse('__SW_CONFIG__'); // replaced by scripts/build-sw.js

const CACHE_PREFIX = 'devocionales-';
const BUILD_CACHE = `${CACHE_PREFIX}${CONFIG.version}`;
const DATA_CACHE = `${CACHE_PREFIX}data`;
const IMAGE_CACHE = `${CACHE_PREFIX}images`;
const DISABLED_CACHE = `${CACHE_PREFIX}disabled`;
const SHELL_PATH = '/devocionales/';
const SHELL_PATHS = new Set([SHELL_PATH, `${SHELL_PATH}index.html`]);
const PAGE_PATHS = new Set([...SHELL_PATHS, ...CONFIG.pages]);
const SLOW = Symbol('slow');
const FAILED = Symbol('failed');

const siteOrigin = self.location.origin;
const absolute = (path) => new URL(path, siteOrigin).href;
const precached = new Set(CONFIG.precache.map(absolute));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .has(DISABLED_CACHE)
      .then((off) => {
        // The kill switch has run: do not rebuild what it just removed.
        if (off) throw new Error('The PWA is switched off');
        return caches.open(BUILD_CACHE);
      })
      // `reload` skips the HTTP cache so a build is never assembled from stale copies.
      .then((cache) => cache.addAll(CONFIG.precache.map((path) => new Request(absolute(path), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && ![BUILD_CACHE, DATA_CACHE, IMAGE_CACHE].includes(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// The page's kill switch (DevotionalSwRegister.disable) leaves the DISABLED_CACHE marker, then
// unregisters this worker and deletes the other caches. An unregistered worker keeps controlling
// the open page until that closes, so it checks the marker and passes requests to the network,
// creating no cache. The marker is explicit on purpose: a build cache evicted by the browser must
// not be mistaken for the kill switch. An enabled page deletes the marker before registering.
async function unlessDisabled(request, handle) {
  if (await caches.has(DISABLED_CACHE)) return fetch(request);
  return handle();
}

async function fromBuild(request, url) {
  const saved = await (await caches.open(BUILD_CACHE)).match(url);
  return saved || fetch(request);
}

async function networkThenBuild(request, url) {
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(() => resolve(SLOW), CONFIG.timeoutMs);
  });
  const network = fetch(new Request(url, { cache: 'no-cache' })).catch(() => FAILED);
  const first = await Promise.race([network, slow]);
  clearTimeout(timer);
  // A captive portal answers 200 with an HTML page: only a real script replaces the build copy.
  if (first !== SLOW && first !== FAILED && first.ok && /javascript/i.test(first.headers.get('content-type') || '')) {
    return first;
  }
  return fromBuild(request, url);
}

// Saves a response only when it is complete and readable: an opaque or failed response would
// later be served as if it were the real file. A CORS-enabled (`cors`) response comes from the
// data host itself. A same-origin (`basic`) one must also be JSON, so a captive-portal or error
// page served with 200 is not kept as data.
function isSavable(response) {
  if (!response.ok) return false;
  if (response.type === 'cors') return true;
  return response.type === 'basic' && /json/i.test(response.headers.get('content-type') || '');
}

// Deletes the oldest entries beyond `limit`; only entries accepted by `counts` take part.
async function trim(cache, limit, counts = () => true) {
  const keys = (await cache.keys()).filter((key) => counts(key.url));
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
}

// Only year files are capped: the index and stats files are small and every load needs them.
async function saveData(request, response) {
  const cache = await caches.open(DATA_CACHE);
  await cache.put(request, response);
  await trim(cache, CONFIG.maxDataEntries, (url) => url.includes('/Devocional_year_'));
}

async function saveImage(url, response) {
  const cache = await caches.open(IMAGE_CACHE);
  await cache.put(url, response);
  await trim(cache, CONFIG.maxImageEntries);
}

async function fetchAndSave(request, event) {
  const response = await fetch(request);
  // In the background and never rejecting: a full or failing cache must not break reading.
  if (isSavable(response)) event.waitUntil(saveData(request, response.clone()).catch(() => {}));
  return response;
}

async function networkFirst(request, event) {
  const network = fetchAndSave(request, event);
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(() => resolve(SLOW), CONFIG.timeoutMs);
  });
  const first = await Promise.race([network.catch(() => FAILED), slow]);
  clearTimeout(timer);
  const answered = first !== SLOW && first !== FAILED;
  if (answered && first.ok) return first;
  const saved = await (await caches.open(DATA_CACHE)).match(request);
  if (saved) {
    if (first === SLOW) event.waitUntil(network.catch(() => {}));
    return saved;
  }
  if (first === SLOW) return network; // nothing saved: a slow answer beats none
  if (answered) return first; // e.g. a 404 for a year that does not exist is the page's to interpret
  return Response.error();
}

async function heroImage(request, event) {
  const saved = await (await caches.open(IMAGE_CACHE)).match(request.url);
  if (saved) return saved;
  let response;
  try {
    response = await fetch(new Request(request.url, { mode: 'cors', credentials: 'omit' }));
  } catch (err) {
    // The host did not allow CORS for this image (or the network failed): the <img>'s own
    // no-cors request may still work, it just cannot be saved.
    return fetch(request);
  }
  if (isSavable(response)) event.waitUntil(saveImage(request.url, response.clone()).catch(() => {}));
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);

  if (url.origin === siteOrigin) {
    const key = absolute(url.pathname);
    if (request.mode === 'navigate' && PAGE_PATHS.has(url.pathname)) {
      const page = SHELL_PATHS.has(url.pathname) ? absolute(SHELL_PATH) : key;
      event.respondWith(unlessDisabled(request, () => fromBuild(request, page)));
    } else if (CONFIG.freshFirst.includes(url.pathname)) {
      event.respondWith(unlessDisabled(request, () => networkThenBuild(request, key)));
    } else if (url.pathname !== SHELL_PATH && precached.has(key)) {
      event.respondWith(unlessDisabled(request, () => fromBuild(request, key)));
    } else if (CONFIG.sameOriginData.includes(url.pathname)) {
      event.respondWith(unlessDisabled(request, () => networkFirst(request, event)));
    }
    return;
  }

  if (url.hostname !== CONFIG.dataHost) return;
  if (CONFIG.dataPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(unlessDisabled(request, () => networkFirst(request, event)));
  } else if (url.pathname.startsWith(CONFIG.imagePathPrefix)) {
    event.respondWith(unlessDisabled(request, () => heroImage(request, event)));
  }
});

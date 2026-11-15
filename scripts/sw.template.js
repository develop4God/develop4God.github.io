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
//    network fails, is slow, or answers with a server error (5xx); a 4xx answer is returned as is.
//    That fallback is what lets a devotional already read open offline. Only complete, CORS-readable responses are saved, and saving happens in
//    the background so a full or failing cache can never delay or break reading.
//  - Hero images: saved on first view and served from the saved copy afterwards. An <img> sends
//    a no-cors request whose response is opaque and unsavable, so the worker fetches the image
//    again with CORS (the host allows it) and answers with that.
//  - Everything else (analytics, other pages, non-GET, Range requests) is left alone.
//
// One build at a time: a new worker does not call skipWaiting() or clients.claim(). It installs
// and waits until no page the previous worker controls is open, and only then activates and
// deletes the previous build cache. A page that loaded one build's scripts therefore never has
// them answered from another build, at the price that an update reaches a reader on their next
// visit after closing the app, not under an open page.
//
// Installing is all or nothing: every precached file is fetched (a few bounded retries each) and
// stored as a clean copy; if one still fails the half-built cache is deleted, the install rejects
// and every open page is sent {type: 'devocionales-install-failed', version, urls}. The worker
// logs nothing by design (the site has no error logging), the message is for a page that cares.
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
// The host redirects `page.html` to the extensionless `page`, so both forms must be served offline.
const PAGE_PATHS = new Set([...SHELL_PATHS, ...CONFIG.pages, ...CONFIG.pages.map((page) => page.replace(/\.html$/, ''))]);
const pageKey = (pathname) => {
  if (SHELL_PATHS.has(pathname)) return SHELL_PATH;
  return pathname.endsWith('.html') ? pathname : `${pathname}.html`;
};
// Must equal STAND_DOWN_MESSAGE in devocionales/js/devotional-sw-register.js (scripts/sw.test.js enforces it).
const STAND_DOWN_MESSAGE = 'devocionales-stand-down';
const INSTALL_FAILED_MESSAGE = 'devocionales-install-failed';
const SLOW = Symbol('slow');
const FAILED = Symbol('failed');

const siteOrigin = self.location.origin;
const absolute = (path) => new URL(path, siteOrigin).href;
const precached = new Set(CONFIG.precache.map(absolute));

// A copy a browser accepts anywhere: a redirected response (the host 308s `page.html` to `page`)
// cannot be served to a navigation, so it is never stored as it came.
async function cleanCopy(response) {
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One precached file, tried up to CONFIG.installAttempts times. `reload` skips the HTTP cache so a
// build is never assembled from stale copies.
async function fetchForBuild(path) {
  let failure;
  for (let attempt = 1; attempt <= CONFIG.installAttempts; attempt += 1) {
    if (attempt > 1) await sleep(CONFIG.installRetryDelayMs * (attempt - 1));
    try {
      const response = await fetch(new Request(absolute(path), { cache: 'reload' }));
      if (response.ok) return await cleanCopy(response);
      failure = new Error(`${response.status} for ${path}`);
    } catch (err) {
      failure = err;
    }
  }
  throw failure;
}

async function announceInstallFailure(urls) {
  try {
    const pages = await self.clients.matchAll({ includeUncontrolled: true });
    for (const page of pages) page.postMessage({ type: INSTALL_FAILED_MESSAGE, version: CONFIG.version, urls });
  } catch (err) {
    // Nobody to tell; the rejected install is the signal that remains.
  }
}

async function buildCache() {
  // The kill switch has run: do not rebuild what it just removed.
  if (await caches.has(DISABLED_CACHE)) throw new Error('The PWA is switched off');
  const cache = await caches.open(BUILD_CACHE);
  const failed = [];
  await Promise.all(CONFIG.precache.map(async (path) => {
    try {
      await cache.put(absolute(path), await fetchForBuild(path));
    } catch (err) {
      failed.push(absolute(path));
    }
  }));
  if (failed.length > 0) {
    await caches.delete(BUILD_CACHE); // never leave a partial build behind
    await announceInstallFailure(failed.sort());
    throw new Error(`Could not precache ${failed.join(', ')}`);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(buildCache());
});

self.addEventListener('activate', (event) => {
  // This also deletes the stand-down marker, so the flag goes with it.
  event.waitUntil(
    standDownKnown
      .then(() => caches.keys())
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && ![BUILD_CACHE, DATA_CACHE, IMAGE_CACHE].includes(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => {
        standDown = false;
      }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === STAND_DOWN_MESSAGE) standDown = true;
});

// The page's kill switch (DevotionalSwRegister.disable) leaves the DISABLED_CACHE marker and
// sends STAND_DOWN_MESSAGE, then unregisters this worker and deletes the other caches. An
// unregistered worker keeps controlling the open page until that closes, so it passes requests to
// the network, creating no cache. The marker is explicit on purpose: a build cache evicted by the
// browser must not be mistaken for the kill switch. The worker keeps the answer in `standDown`
// instead of asking the Cache API on every request: it reads the marker once when it starts (a
// restarted worker has no memory of the message), sets the flag on the message, and clears it when
// it activates and removes the marker. An enabled page deletes the marker before registering.
let standDown = false;
const standDownKnown = caches.has(DISABLED_CACHE).then(
  (marked) => {
    if (marked) standDown = true;
  },
  () => {},
);

async function unlessDisabled(request, handle, passThrough = () => fetch(request)) {
  await standDownKnown;
  if (standDown) return passThrough();
  return handle();
}

async function fromBuild(request, url) {
  const saved = await (await caches.open(BUILD_CACHE)).match(url);
  return saved || fetch(request);
}

async function networkThenBuild(request, url) {
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(() => resolve(SLOW), CONFIG.freshTimeoutMs);
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
  if (standDown) return; // told to stand down while the request was in flight: do not undo the sweep
  const cache = await caches.open(DATA_CACHE);
  await cache.put(request, await cleanCopy(response));
  await trim(cache, CONFIG.maxDataEntries, (url) => url.includes('/Devocional_year_'));
}

async function saveImage(url, response) {
  if (standDown) return;
  const cache = await caches.open(IMAGE_CACHE);
  await cache.put(url, await cleanCopy(response));
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
  // A 4xx is the server's real answer (e.g. a year that does not exist), never masked by a saved
  // copy; only a failed network or a 5xx falls back to one.
  if (answered && first.status < 500) return first;
  const saved = await (await caches.open(DATA_CACHE)).match(request);
  if (saved) {
    if (first === SLOW) event.waitUntil(network.catch(() => {}));
    return saved;
  }
  if (first === SLOW) return network; // nothing saved: a slow answer beats none
  if (answered) return first; // a 5xx with nothing saved is still the server's answer
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
      const page = absolute(pageKey(url.pathname));
      event.respondWith(unlessDisabled(request, () => fromBuild(request, page)));
    } else if (CONFIG.freshFirst.includes(url.pathname)) {
      // Even stood down, the config is revalidated: the HTTP cache must not delay switching back on.
      event.respondWith(unlessDisabled(
        request,
        () => networkThenBuild(request, key),
        () => fetch(new Request(key, { cache: 'no-cache' })),
      ));
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

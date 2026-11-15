/* eslint-env serviceworker */
// Service worker for /devocionales/. Generated into devocionales/sw.js by scripts/build-sw.js:
// edit this template, never the generated file.
//
// What it does, by kind of request:
//  - The page shell and every file it loads (scripts, styles, fonts, icons, language files) are
//    precached in one cache per build and served from it. HTML and scripts therefore always come
//    from the same build; a deploy reaches readers through a new worker, not through a newer
//    HTML file meeting older cached scripts.
//  - Devotional data (year files and index.json on raw.githubusercontent.com, plus the hero-image
//    list the page also waits for before it renders): network first, so
//    a reader online always gets current content. The last good copy is the fallback when the
//    network fails, is slow, or answers with an error, which is what lets a devotional already
//    read open offline. Only complete, CORS-readable responses are saved, and saving happens in
//    the background so a full or failing cache can never delay or break reading.
//  - Everything else (analytics, images, other pages, non-GET, Range requests) is left alone.
//
// Two kinds of cache: `devocionales-<version>` holds one build and is deleted when a newer
// worker activates; `devocionales-data` survives deploys, since remote content is independent of
// the page build. The data cache keeps the newest few year files and never evicts index.json.

const CONFIG = JSON.parse("{\"version\":\"f244db597436\",\"timeoutMs\":4000,\"maxDataEntries\":24,\"dataHost\":\"raw.githubusercontent.com\",\"dataPathPrefixes\":[\"/develop4God/Devocionales-json/\",\"/develop4God/Devocionales-assets/main/images/devotionals/index.json\"],\"precache\":[\"/devocionales/\",\"/devocionales/css/language-selector.css\",\"/devocionales/css/modern.css\",\"/devocionales/icons/apple-touch-icon.png\",\"/devocionales/icons/icon-192.png\",\"/devocionales/icons/icon-512.png\",\"/devocionales/icons/icon-maskable-512.png\",\"/devocionales/js/bible-text-formatter.js\",\"/devocionales/js/devotional-error-logger.js\",\"/devocionales/js/devotional-fetch.js\",\"/devocionales/js/devotional-i18n-adapter.js\",\"/devocionales/js/devotional-install.js\",\"/devocionales/js/devotional-loader.js\",\"/devocionales/js/devotional-nav.js\",\"/devocionales/js/devotional-progress.js\",\"/devocionales/js/devotional-render-dom.js\",\"/devocionales/js/devotional-salvation-modal.js\",\"/devocionales/js/devotional-share.js\",\"/devocionales/js/devotional-sw-register.js\",\"/devocionales/js/devotional-tts.js\",\"/devocionales/js/devotional-version.js\",\"/devocionales/js/i18n.js\",\"/devocionales/js/modern.js\",\"/devocionales/manifest.webmanifest\",\"/devocionales/vendor/fonts/inter-latin-ext.woff2\",\"/devocionales/vendor/fonts/inter-latin.woff2\",\"/devocionales/vendor/lucide.min.js\",\"/devocionales/vendor/tailwind.css\",\"/js/app-stats.js\",\"/js/rtl-helper.js\",\"/js/site-footer.js\",\"/lang/devocionales/ar.json\",\"/lang/devocionales/de.json\",\"/lang/devocionales/en.json\",\"/lang/devocionales/es.json\",\"/lang/devocionales/fil.json\",\"/lang/devocionales/fr.json\",\"/lang/devocionales/hi.json\",\"/lang/devocionales/ja.json\",\"/lang/devocionales/pt.json\",\"/lang/devocionales/zh.json\"]}"); // replaced by scripts/build-sw.js

const CACHE_PREFIX = 'devocionales-';
const BUILD_CACHE = `${CACHE_PREFIX}${CONFIG.version}`;
const DATA_CACHE = `${CACHE_PREFIX}data`;
const SHELL_PATH = '/devocionales/';
const SHELL_PATHS = new Set([SHELL_PATH, `${SHELL_PATH}index.html`]);
const SLOW = Symbol('slow');
const FAILED = Symbol('failed');

const siteOrigin = self.location.origin;
const absolute = (path) => new URL(path, siteOrigin).href;
const precached = new Set(CONFIG.precache.map(absolute));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(BUILD_CACHE)
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
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== BUILD_CACHE && name !== DATA_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function fromBuild(request, url) {
  const saved = await (await caches.open(BUILD_CACHE)).match(url);
  return saved || fetch(request);
}

// Saves a response only when it is complete and readable: an opaque or failed response would
// later be served as if it were the real file.
function isSavable(response) {
  return response.ok && response.type === 'cors';
}

// Keeps the newest year files; index.json is exempt because it is the one file every load needs.
async function save(request, response) {
  const cache = await caches.open(DATA_CACHE);
  await cache.put(request, response);
  const years = (await cache.keys()).filter((key) => !key.url.endsWith('/index.json'));
  for (const key of years.slice(0, Math.max(0, years.length - CONFIG.maxDataEntries))) await cache.delete(key);
}

async function fetchAndSave(request, event) {
  const response = await fetch(request);
  // In the background and never rejecting: a full or failing cache must not break reading.
  if (isSavable(response)) event.waitUntil(save(request, response.clone()).catch(() => {}));
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);

  if (url.origin === siteOrigin) {
    if (request.mode === 'navigate' && SHELL_PATHS.has(url.pathname)) {
      event.respondWith(fromBuild(request, absolute(SHELL_PATH)));
    } else if (url.pathname !== SHELL_PATH && precached.has(absolute(url.pathname))) {
      event.respondWith(fromBuild(request, absolute(url.pathname)));
    }
    return;
  }

  if (url.hostname === CONFIG.dataHost && CONFIG.dataPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(networkFirst(request, event));
  }
});

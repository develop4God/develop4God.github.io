/* eslint-env serviceworker */
// Service worker for /devocionales/. Generated into devocionales/sw.js by scripts/build-sw.js:
// edit this template, never the generated file.
//
// What it serves, by kind of request:
//  - The page shell, the legal pages and every file they load (scripts, styles, fonts, icons,
//    language files) are precached in one cache per build and served from it. HTML and scripts
//    therefore always come from the same build.
//  - The PWA config script is the one precached file fetched fresh first (bypassing the HTTP
//    cache), so switching the PWA off reaches an online reader on their next visit without
//    waiting for a worker update. The build copy is the fallback.
//  - Devotional data (year files and index.json on raw.githubusercontent.com, the hero-image list
//    the page waits for before it renders, and the same-origin app stats): network first, so a
//    reader online always gets current content. The last good copy is the fallback when the
//    network fails, is slow, or answers with anything but success or a real absence: a rate limit
//    (403, 429), a timeout (408) or a server error (5xx) must not hide a devotional already read.
//    A 404 or 410 (the year or file does not exist) is returned as is and never saved. Only
//    complete (200), CORS-readable responses are saved, in the background, so a full or failing
//    cache can never delay or break reading.
//  - Hero images: saved on first view and served from the saved copy afterwards. An <img> sends
//    a no-cors request whose response is opaque and unsavable, so the worker fetches the image
//    again with CORS (the host allows it) and answers with that.
//  - Everything else (analytics, other pages, non-GET, Range requests) is left alone.
//
// Builds never mix in one page:
//  - A new worker installs and waits; it does not take over by itself. The page that is running
//    the old build asks it to (DevotionalSwRegister.deliverUpdates) only while its tab is hidden,
//    and the worker obeys only when every page of the site is hidden, so no visible page ever gets
//    another build's files. The pages then reload (reloadOnUpdate) once hidden.
//  - The first worker ever installed claims the pages that loaded without one, but only if every
//    page answers that it runs this worker's build (DevotionalBuild.id, stamped by build-sw). A
//    page of another build, or one that does not answer, is never claimed.
//
// The kill switch (DevotionalSwRegister.disable) leaves the marker cache, unregisters the worker
// and deletes every other devocionales-* cache. The marker is the one source of truth, and no
// message is needed: every write goes through writeTo(), which refuses to write while the marker
// exists and deletes the cache it just wrote if the marker appeared meanwhile, so a worker that
// still controls an open page, or is still installing, cannot refill what the sweep emptied.
// Reads use caches.match with a cacheName, which never creates a cache, and serving from the build
// cache does not look the marker up at all. An enabled page deletes the marker before registering.
//
// Installing is all or nothing: every precached file is fetched first (a few bounded retries
// each) and only then written, in one guarded write; one failure rejects the install and no build
// cache exists. The worker logs and reports nothing by design (the site has no error logging).
//
// Caches: `devocionales-<version>` holds one build and is deleted when a newer worker activates;
// `devocionales-data` and `devocionales-images` survive deploys, since remote content is
// independent of the page build. Each keeps only the newest entries (the data cache never evicts
// the small index and stats files).

const CONFIG = JSON.parse("{\"version\":\"886e5600cfdc\",\"claimTimeoutMs\":1000,\"installAttempts\":3,\"installRetryDelayMs\":500,\"timeoutMs\":4000,\"freshTimeoutMs\":1000,\"maxDataEntries\":24,\"maxStudyEntries\":100,\"imagePathPrefix\":\"/develop4God/Devocionales-assets/main/images/devotionals/\",\"maxImageEntries\":30,\"freshFirst\":[\"/devocionales/js/devotional-pwa-config.js\"],\"sameOriginData\":[\"/data/app-stats.json\"],\"dataHost\":\"raw.githubusercontent.com\",\"dataPathPrefixes\":[\"/develop4God/Devocionales-json/\",\"/develop4God/Devocionales-assets/main/images/devotionals/index.json\"],\"pages\":[\"/devocionales/privacy-policy.html\",\"/devocionales/terms-and-conditions.html\",\"/devocionales/encounters/index.html\",\"/devocionales/estudios/index.html\"],\"precache\":[\"/devocionales/\",\"/devocionales/css/chrome.css\",\"/devocionales/css/discovery.css\",\"/devocionales/css/encounters.css\",\"/devocionales/css/language-selector.css\",\"/devocionales/css/modern.css\",\"/devocionales/css/theme.css\",\"/devocionales/encounters/index.html\",\"/devocionales/estudios/index.html\",\"/devocionales/icons/apple-touch-icon.png\",\"/devocionales/icons/icon-192.png\",\"/devocionales/icons/icon-512.png\",\"/devocionales/icons/icon-maskable-512.png\",\"/devocionales/js/bible-text-formatter.js\",\"/devocionales/js/content-index.js\",\"/devocionales/js/devotional-app-version.js\",\"/devocionales/js/devotional-build.js\",\"/devocionales/js/devotional-error-logger.js\",\"/devocionales/js/devotional-fetch.js\",\"/devocionales/js/devotional-i18n-adapter.js\",\"/devocionales/js/devotional-install.js\",\"/devocionales/js/devotional-ios-hint.js\",\"/devocionales/js/devotional-loader.js\",\"/devocionales/js/devotional-manifest.js\",\"/devocionales/js/devotional-nav.js\",\"/devocionales/js/devotional-progress.js\",\"/devocionales/js/devotional-push-firebase.js\",\"/devocionales/js/devotional-push-help.js\",\"/devocionales/js/devotional-push-log.js\",\"/devocionales/js/devotional-push-offer.js\",\"/devocionales/js/devotional-push-store.js\",\"/devocionales/js/devotional-push.js\",\"/devocionales/js/devotional-pwa-config.js\",\"/devocionales/js/devotional-render-dom.js\",\"/devocionales/js/devotional-salvation-modal.js\",\"/devocionales/js/devotional-share.js\",\"/devocionales/js/devotional-standalone.js\",\"/devocionales/js/devotional-sw-boot.js\",\"/devocionales/js/devotional-sw-register.js\",\"/devocionales/js/devotional-theme.js\",\"/devocionales/js/devotional-tts.js\",\"/devocionales/js/devotional-version.js\",\"/devocionales/js/discovery-boot.js\",\"/devocionales/js/discovery-cache.js\",\"/devocionales/js/discovery-card-dom.js\",\"/devocionales/js/discovery-cards.js\",\"/devocionales/js/discovery-copyright.js\",\"/devocionales/js/discovery-data.js\",\"/devocionales/js/discovery-detail-dom.js\",\"/devocionales/js/discovery-detail-page.js\",\"/devocionales/js/discovery-list-dom.js\",\"/devocionales/js/discovery-list-page.js\",\"/devocionales/js/discovery-nav.js\",\"/devocionales/js/discovery-router.js\",\"/devocionales/js/discovery-share-text.js\",\"/devocionales/js/discovery-sort-filter.js\",\"/devocionales/js/discovery-store.js\",\"/devocionales/js/dom-builder.js\",\"/devocionales/js/encounter-boot.js\",\"/devocionales/js/encounter-card-dom.js\",\"/devocionales/js/encounter-cards.js\",\"/devocionales/js/encounter-data.js\",\"/devocionales/js/encounter-entitlement.js\",\"/devocionales/js/encounter-images.js\",\"/devocionales/js/encounter-list-page.js\",\"/devocionales/js/encounter-lock.js\",\"/devocionales/js/encounter-pass-dom.js\",\"/devocionales/js/encounter-paypal.js\",\"/devocionales/js/encounter-reader-dom.js\",\"/devocionales/js/encounter-reader-page.js\",\"/devocionales/js/encounter-reader-view.js\",\"/devocionales/js/encounter-route.js\",\"/devocionales/js/encounter-store.js\",\"/devocionales/js/encounter-unlock-sheet-dom.js\",\"/devocionales/js/encounter-welcome-dom.js\",\"/devocionales/js/i18n.js\",\"/devocionales/js/key-verse-card.js\",\"/devocionales/js/modern.js\",\"/devocionales/js/share-or-copy.js\",\"/devocionales/js/storage-json.js\",\"/devocionales/js/ui-celebration.js\",\"/devocionales/js/ui-pager-dots.js\",\"/devocionales/js/ui-swipe-drag.js\",\"/devocionales/js/ui-toast.js\",\"/devocionales/js/verse-share.js\",\"/devocionales/manifest.webmanifest\",\"/devocionales/privacy-policy.html\",\"/devocionales/pwa/devotional-shell-core.js\",\"/devocionales/pwa/devotional-shell.js\",\"/devocionales/pwa/shell.css\",\"/devocionales/terms-and-conditions.html\",\"/devocionales/vendor/fonts/inter-latin-ext.woff2\",\"/devocionales/vendor/fonts/inter-latin.woff2\",\"/devocionales/vendor/lucide.min.js\",\"/devocionales/vendor/tailwind.css\",\"/js/app-stats.js\",\"/js/paypal-checkout.js\",\"/js/rtl-helper.js\",\"/js/site-footer.js\",\"/lang/devocionales/ar.json\",\"/lang/devocionales/de.json\",\"/lang/devocionales/en.json\",\"/lang/devocionales/es.json\",\"/lang/devocionales/fil.json\",\"/lang/devocionales/fr.json\",\"/lang/devocionales/hi.json\",\"/lang/devocionales/ja.json\",\"/lang/devocionales/pt.json\",\"/lang/devocionales/zh.json\"]}"); // replaced by scripts/build-sw.js

const CACHE_PREFIX = 'devocionales-';
const BUILD_CACHE = `${CACHE_PREFIX}${CONFIG.version}`;
const DATA_CACHE = `${CACHE_PREFIX}data`;
const IMAGE_CACHE = `${CACHE_PREFIX}images`;
const DISABLED_CACHE = `${CACHE_PREFIX}disabled`;
const KEPT_CACHES = [BUILD_CACHE, DATA_CACHE, IMAGE_CACHE, DISABLED_CACHE];
// Must equal the constants of the same name in devocionales/js/devotional-sw-register.js
// (scripts/sw.test.js enforces it).
const SKIP_WAITING_MESSAGE = 'devocionales-skip-waiting';
const BUILD_QUERY_MESSAGE = 'devocionales-build?';
const SHELL_PATH = '/devocionales/';
const SHELL_PATHS = new Set([SHELL_PATH, `${SHELL_PATH}index.html`]);
// The host redirects `page.html` to the extensionless `page`, so both forms must be served offline.
// A folder page (`<folder>/index.html`) is also reached as `<folder>/` and `<folder>`.
const FOLDER_PAGES = CONFIG.pages.filter((page) => page.endsWith('/index.html')).map((page) => page.slice(0, -'index.html'.length));
const PAGE_PATHS = new Set([
  ...SHELL_PATHS,
  ...CONFIG.pages,
  ...CONFIG.pages.map((page) => page.replace(/\.html$/, '')),
  ...FOLDER_PAGES,
  ...FOLDER_PAGES.map((folder) => folder.slice(0, -1)),
]);
const pageKey = (pathname) => {
  if (SHELL_PATHS.has(pathname)) return SHELL_PATH;
  if (FOLDER_PAGES.includes(pathname)) return `${pathname}index.html`;
  if (FOLDER_PAGES.includes(`${pathname}/`)) return `${pathname}/index.html`;
  return pathname.endsWith('.html') ? pathname : `${pathname}.html`;
};
const SLOW = Symbol('slow');
const FAILED = Symbol('failed');

const siteOrigin = self.location.origin;
const absolute = (path) => new URL(path, siteOrigin).href;
const precached = new Set(CONFIG.precache.map(absolute));

// The only way this worker writes to a cache. `write` gets the opened cache; nothing is written
// while the kill-switch marker exists, and if the marker appeared during the write the cache is
// deleted again (the kill switch creates the marker before it sweeps, so a write that ends after
// the sweep always sees the marker). Resolves to whether the write was kept.
async function writeTo(name, write) {
  if (await caches.has(DISABLED_CACHE)) return false;
  await write(await caches.open(name));
  if (await caches.has(DISABLED_CACHE)) {
    await caches.delete(name);
    return false;
  }
  return true;
}

// What gets stored. A redirected response (the host 308s `page.html` to `page`) cannot be served
// to a navigation, so it is stored as a fresh copy without the redirect flag; any other response
// is stored as it came, without buffering its body.
async function cleanCopy(response) {
  if (!response.redirected) return response;
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
      if (response.status === 200) return [absolute(path), await cleanCopy(response)];
      failure = new Error(`${response.status} for ${path}`);
    } catch (err) {
      failure = err;
    }
  }
  throw failure;
}

async function buildCache() {
  const switchedOff = new Error('The PWA is switched off');
  if (await caches.has(DISABLED_CACHE)) throw switchedOff;
  const files = await Promise.all(CONFIG.precache.map(fetchForBuild));
  let kept;
  try {
    kept = await writeTo(BUILD_CACHE, async (cache) => {
      for (const [url, response] of files) await cache.put(url, response);
    });
  } catch (err) {
    await caches.delete(BUILD_CACHE); // never leave a partial build behind
    throw err;
  }
  if (!kept) throw switchedOff;
}

self.addEventListener('install', (event) => {
  event.waitUntil(buildCache());
});

// Asks one page which build it runs; null when it cannot or does not answer in time.
function askBuild(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const done = (answer) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(answer);
    };
    const timer = setTimeout(() => done(null), CONFIG.claimTimeoutMs);
    channel.port1.onmessage = (event) => done(event.data);
    try {
      client.postMessage({ type: BUILD_QUERY_MESSAGE }, [channel.port2]);
    } catch (err) {
      done(null);
    }
  });
}

// Claims the open pages only when every one of them runs this worker's build.
async function claimMatchingPages() {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const builds = await Promise.all(pages.map(askBuild));
  if (builds.every((build) => build === CONFIG.version)) await self.clients.claim();
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && !KEPT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      ))
      .then(claimMatchingPages),
  );
});

// A page running the old build asks this waiting worker to take over. Normally only when every
// page is hidden: a visible page must never get another build's files under it. An entry request
// comes from a page that has only just loaded, so the reader has not started anything on it: it is
// obeyed when every OTHER page is hidden (the sender is found by its client id; without one the
// request is treated as a plain one).
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== SKIP_WAITING_MESSAGE) return;
  const senderId = event.data.entry && event.source ? event.source.id : null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((pages) => {
      const others = pages.filter((page) => senderId === null || page.id !== senderId);
      if (others.every((page) => page.visibilityState === 'hidden')) return self.skipWaiting();
      return undefined;
    }),
  );
});

// Push notifications: scripts/sw-push.js is inlined here by scripts/build-sw.js.
/* eslint-env serviceworker */
// Push handlers of the /devocionales/ worker. build-sw.js inlines this file into the generated
// worker at the __SW_PUSH__ marker of sw.template.js and hashes it into the worker version, so a
// change here ships a new worker.
//
// Why no Firebase SDK here: FCM delivers a standard Web Push message, so the browser needs only a
// `push` listener to show it. The SDK stays on the page (loaded after opt-in). These handlers
// never touch the network or the caches, so they cannot interfere with the fetch/message/install
// handlers or with the kill switch.
(function () {
  const SHELL_PATH = '/devocionales/';
  const ICON = `${SHELL_PATH}icons/icon-192.png`;
  // Shown when a message carries no title (a data-only or malformed payload): a push must always
  // show exactly one notification, or the browser shows its own generic one.
  const FALLBACK_TITLE = 'Devocionales Cristianos';

  const isObject = (value) => value !== null && typeof value === 'object';

  // The payload as an object; plain text becomes the body, anything unreadable becomes empty.
  function readPayload(data) {
    if (!data) return {};
    try {
      const parsed = data.json();
      return isObject(parsed) ? parsed : {};
    } catch (err) {
      try {
        const text = data.text();
        return text ? { notification: { body: String(text) } } : {};
      } catch (err2) {
        return {};
      }
    }
  }

  const text = (value) => (typeof value === 'string' && value ? value : undefined);

  function toNotification(payload) {
    const notification = isObject(payload.notification) ? payload.notification : {};
    const data = isObject(payload.data) ? payload.data : {};
    const options = {
      body: text(notification.body) || text(data.body),
      icon: ICON,
      // One slot: pushes queued while the device was offline collapse into the latest one.
      tag: 'daily-devotional',
      renotify: true,
      data: { url: SHELL_PATH },
    };
    const lang = text(data.lang);
    if (lang) options.lang = lang;
    return { title: text(notification.title) || text(data.title) || FALLBACK_TITLE, options };
  }

  self.addEventListener('push', (event) => {
    const { title, options } = toNotification(readPayload(event.data));
    event.waitUntil(self.registration.showNotification(title, options));
  });

  // Only the reader itself: the legal pages live under the same path but are not what a click is for.
  const isReaderWindow = (client) => {
    try {
      const { pathname } = new URL(client.url);
      return pathname === SHELL_PATH || pathname === `${SHELL_PATH}index.html`;
    } catch (err) {
      return false;
    }
  };

  async function showReader() {
    try {
      const reader = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).find(isReaderWindow);
      if (reader) {
        await reader.focus();
        return undefined;
      }
    } catch (err) {
      // Fall through: opening the reader is better than doing nothing.
    }
    return self.clients.openWindow(SHELL_PATH);
  }

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(showReader());
  });
}());

async function fromBuild(request, url) {
  const saved = await caches.match(url, { cacheName: BUILD_CACHE });
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
  if (response.status !== 200) return false; // not a partial (206) answer
  if (response.type === 'cors') return true;
  return response.type === 'basic' && /json/i.test(response.headers.get('content-type') || '');
}

// Deletes the oldest entries beyond `limit`; only entries accepted by `counts` take part.
async function trim(cache, limit, counts = () => true) {
  const keys = (await cache.keys()).filter((key) => counts(key.url));
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
}

// Year files and Bible-study files are capped, each against its own kind: the index and stats files
// are small and every load needs them, and reading many studies must not evict the devotional.
const isStudyFile = (url) => url.includes('/discovery/') && !url.endsWith('/discovery/index.json');

async function saveData(request, response) {
  const copy = await cleanCopy(response);
  await writeTo(DATA_CACHE, async (cache) => {
    await cache.put(request, copy);
    await trim(cache, CONFIG.maxDataEntries, (url) => url.includes('/Devocional_year_'));
    await trim(cache, CONFIG.maxStudyEntries, isStudyFile);
  });
}

async function saveImage(url, response) {
  const copy = await cleanCopy(response);
  await writeTo(IMAGE_CACHE, async (cache) => {
    await cache.put(url, copy);
    await trim(cache, CONFIG.maxImageEntries);
  });
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
  // Success, or a real absence (a year that does not exist), is the answer. Anything else (a rate
  // limit, a timeout, an outage) falls back to the saved copy.
  if (answered && (first.ok || first.status === 404 || first.status === 410)) return first;
  const saved = await caches.match(request, { cacheName: DATA_CACHE });
  if (saved) {
    if (first === SLOW) event.waitUntil(network.catch(() => {}));
    return saved;
  }
  if (first === SLOW) return network; // nothing saved: a slow answer beats none
  if (answered) return first; // nothing saved: the error itself is the only answer there is
  return Response.error();
}

async function heroImage(request, event) {
  const saved = await caches.match(request.url, { cacheName: IMAGE_CACHE });
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
      event.respondWith(fromBuild(request, absolute(pageKey(url.pathname))));
    } else if (CONFIG.freshFirst.includes(url.pathname)) {
      event.respondWith(networkThenBuild(request, key));
    } else if (url.pathname !== SHELL_PATH && precached.has(key)) {
      event.respondWith(fromBuild(request, key));
    } else if (CONFIG.sameOriginData.includes(url.pathname)) {
      event.respondWith(networkFirst(request, event));
    }
    return;
  }

  if (url.hostname !== CONFIG.dataHost) return;
  if (CONFIG.dataPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(networkFirst(request, event));
  } else if (url.pathname.startsWith(CONFIG.imagePathPrefix)) {
    event.respondWith(heroImage(request, event));
  }
});

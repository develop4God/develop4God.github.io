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

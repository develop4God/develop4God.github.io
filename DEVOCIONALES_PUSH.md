# Devocionales PWA: daily push notifications

Status: implemented behind `pushEnabled` (off by default).

## Goal

Let a reader of `/devocionales/` opt in to the same daily devotional notification the Flutter app
sends, using the existing Firebase backend (project `devocional-app`). No change to the Flutter app
or to the deployed Cloud Functions. Off by default behind `pushEnabled` in
`devocionales/js/devotional-pwa-config.js`.

## How it works with the existing backend

- `sendDailyDevotionalNotification` runs hourly. It lists `users` (parent documents only), reads
  `users/{uid}/settings/notifications`, matches `userLocalTime.hour === preferredHour` (minutes are
  ignored), then sends to every document in `users/{uid}/fcmTokens` with `sendEachForMulticast`.
- `cleanupInvalidFCMTokens` runs daily and deletes a user (Firestore documents only, never Auth) when
  there are no settings, or `lastLogin` is missing or older than 15 days, or every token `createdAt`
  is older than 30 days.
- Firestore rules allow a signed-in user to read and write only their own `users/{uid}` tree.
- A Web app (`Devocionales PWA`) is registered in the project. Anonymous sign-in is enabled.

## Write model: a mirror of the app

The page writes exactly what the Flutter app writes, from
`devocional_nuevo/lib/services/user_profile_store.dart` (`FirestoreUserProfileStore`), in
`devocionales/js/devotional-push-store.js`. On every entry while opted in (and on enable), in the
app's order, all with `merge: true`:

1. `users/{uid}` `{ lastLogin }` (server timestamp).
2. `users/{uid}/fcmTokens/{rawToken}` `{ token, createdAt, platform }`. The raw token is the document id.
3. `users/{uid}/settings/notifications` `{ notificationsEnabled, notificationTime ("HH:00"), userTimezone, lastUpdated, preferredLanguage }`.
   An unknown timezone or language is left out so the merge keeps the old value.
   `lastNotificationSentDate` is server-owned and never written.

Deliberate difference: `platform` is `'web'` (the app writes Dart enum text such as
`TargetPlatform.android`; the scheduler never reads the field).

There is no throttle, no existence read, no self-heal, no token rotation and no hashing. Writing on
every entry keeps `lastLogin` and token `createdAt` fresh, which is all the cleanup job needs.
Failures are silent and retried on the next visit.

Other rules:

- Anonymous Firebase Auth; Firestore rules unchanged.
- Disable (button, revoked permission or kill switch), best-effort: write `notificationsEnabled: false`
  (merge), delete this browser's token document, `deleteToken()`, clear the local flags. The user and
  settings documents and the anonymous account stay; the existing cleanup removes them.
- A missing config object changes nothing. Only an explicit `pushEnabled !== true` or
  `enabled: false` hides the block and runs the disable flow when opted in.
- One busy flag: taps and hour changes are ignored while a flow runs.
- `adapter.registration()` gives up after 10 s when the worker never becomes active (rejects with
  `registration-timeout`); `deleteToken` skips the SDK unless permission is granted and otherwise
  binds the `/devocionales/` registration through `getToken`.
- No Firebase SDK in the service worker (own `push` and `notificationclick` handlers); the SDK is
  lazy-loaded in the page after opt-in and never precached.

## Evidence from the spike (throwaway, headed Chromium)

- Anonymous sign-in, default VAPID key and a custom worker registration work.
- Own-uid Firestore writes pass; a write to another uid is denied.
- Page closed: one notification is shown, no duplicates.
- Page visible: the SDK shows nothing; with our own handler the worker shows every push.
- Raw push payload: `{"notification":{"title","body"},"from","priority","fcmMessageId"}` plus `data`
  when present.
- The scheduler reported delivery to the web token.
- A synthetic click runs the handler but `openWindow` is refused; the real click is verified manually.
- Headless Chromium blocks notification permission, so end-to-end tests cannot cover real delivery.

## Acceptance criteria

- A1 No permission prompt, SDK load or Firebase call on load unless opted in, permission granted and `pushEnabled`.
- A2 The button is shown only where Notification, Push and service workers exist; iOS Safari outside standalone shows an install hint.
- A3 Denied permission leaves the button off with a localized message.
- A4 Revoked permission is detected on the next visit and runs the disable flow.
- A5 Disabling writes `notificationsEnabled: false`, deletes the token document and the browser token.
- B1 Writes follow the mirror above, in order, under the user's own `users/{uid}`.
- C1 Page and tab closed: the notification is shown once. Manual.
- C2 The production scheduler payload is shown in the user's language. Manual, with a screenshot and the function log.
- C3 Page visible: shown once, from the worker.
- C4 Clicking opens or focuses `/devocionales/` and closes the notification. Manual.
- C5 The worker shows the PWA icon.
- D1 Existing offline, update and kill-switch behavior unchanged; all gates green.

## Limitations

- The desktop browser must be running to receive a push.
- No collapse key: pushes sent while the device was offline can all arrive when it returns.
- A reader silent for 15 days is deleted by the existing cleanup, the same as in the app.
- A disable that fails (offline, SDK blocked) is not retried: the browser shows "off" but the server may keep sending until the existing 15-day cleanup, the same as the app.
- When FCM rotates the token or the anonymous account is lost, the old token and user documents are left for the cleanup and the scheduler's invalid-token pruning (a duplicate notification is possible meanwhile), the same as the app.
- A failed enable can leave a partial server write that the cleanup removes.
- Each visit of an opted-in reader lazy-loads about 560 kB of uncached Firebase SDK and does the three writes, by design, mirroring the app.
- The web API key is public by design; the referrer restriction and our own VAPID key are launch steps outside the code (`pushEnabled` stays false until they are done).
- Two tabs open at once can re-enable a disable made in the other tab until the next visit.

## Out of scope for v1

Images, action buttons, more than one notification a day, Firefox and Safari desktop guarantees, iOS
automated tests, any change to the Flutter app or the Cloud Functions.

## Before launch (outside the code)

1. Done (2026-11-15): our own VAPID public key is in `devotional-pwa-config.js` (changing it later invalidates every token).
2. Done (2026-11-15): the web API key (`8e14c025...`) is restricted by HTTP referrer to develop4god.com, www.develop4god.com, develop4god-github-io.pages.dev, develop4god.github.io, the two Firebase hosts and localhost; its 27 API restrictions are unchanged. Allowed origins pass, other origins and empty referers get 403.
3. Done by the owner: budget alerts.
4. Done (2026-11-15): authorized domains in Authentication now include develop4god.com, www.develop4god.com, develop4god-github-io.pages.dev and develop4god.github.io.
5. No privacy policy change: the policy page is already linked from the page and reachable by every PWA user. The short consent line next to the button (`push.consent`) stays.
6. Still open: real-device checks (installed PWA click with the app closed and open, Android Chrome, installed iOS PWA), then set `pushEnabled: true`.

## Status (2026-11-15)

| Area | State |
|---|---|
| Implementation (store, facade, adapter, worker handlers, UI, 10 languages) | Done, on this PR, validator 8/8, CI green |
| Write model mirrors the app's `FirestoreUserProfileStore` | Done, checked against real documents |
| Own VAPID key | Done, delivery verified in a real browser |
| Web API key referrer restriction, authorized domains | Done and verified |
| Secret-scanning alert #1 (the public web key) | Closed as "won't fix" (public by design, restricted) |
| Proven live (throwaway spike) | Background display, production scheduler payload (twice), real click opens the page |
| Installed-PWA click with the app closed and open | **Open** (needs a person at the desktop) |
| Android Chrome, installed iOS PWA | **Open** (needs real devices) |
| `pushEnabled: true` | **Set on 2026-11-16 at the owner's explicit instruction, to test the real behavior and the Firebase saves.** The real-device checks above are still open and are run by the owner afterwards. |
| Known intermittent e2e: `devocionales-pwa.spec.js` worker-update test fails in roughly 4 of 10 full-suite runs on this branch (passes alone, passed 3 of 3 on `main`); under load the 45 s test budget is exceeded. A hero-image reader test that loads a remote image can also fail on a network hiccup. | **Open**, under investigation; CI passed. |

## Merge gate

`pushEnabled` was switched on 2026-11-16 by the owner's explicit decision, ahead of the real-device checks C1 to C5, to verify the behavior and the Firestore writes. Those checks remain open; if one fails, the emergency stop is `pushEnabled: false` plus the manual token cleanup described above.

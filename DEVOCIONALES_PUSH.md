# Devocionales PWA: daily push notifications

Status: plan and acceptance criteria. No implementation yet.

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

## Design decisions

| Decision | Why |
|---|---|
| Anonymous Firebase Auth, data under `users/{uid}` | Reuses the scheduler and the rules unchanged |
| Write `users/{uid}` (`lastLogin`, merge) **before** settings and token | The scheduler lists parent documents only; a user with only subcollections is never sent to |
| Token document id = SHA-256 of the token | Idempotent writes: two tabs or repeated taps cannot create duplicate pushes |
| Re-stamp token `createdAt` at most once a day, even if the token is unchanged | The 30-day cleanup rule |
| `lastLogin` refreshed at most once a day while enabled | The 15-day cleanup rule |
| Each visit checks that the settings document still exists and rewrites everything if cleanup removed it | Silent deletion must self-heal |
| Always write with merge and only client-owned fields | A plain `set` would wipe `lastNotificationSentDate` and cause a second send the same day |
| `notificationTime` stored as `"HH:00"`, hour-only picker | The function ignores minutes |
| **No Firebase SDK in the service worker**; our own `push` and `notificationclick` handlers | Verified in a spike: shows one notification with our icon; avoids `importScripts` from a CDN breaking the offline install |
| Firebase SDK lazy-loaded in the page after opt-in, never precached | Weight; zero Firebase calls for users who never opt in |
| One `unsubscribe()` (deleteToken, delete token, settings and user documents, delete the anonymous account), also run by the kill switch | Erasure and no Auth accumulation |
| Push code in its own files, not in `sw.template.js` or `devotional-loader.js` | SOLID, no god objects |

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

### Opt-in
- A1 No permission prompt on load; only after an explicit tap on the enable button.
- A2 The button is shown only where Notification, Push and service workers exist. iOS Safari outside
  standalone mode shows an "install first" hint instead.
- A3 Denied permission leaves the button off with a localized message and no error.
- A4 Revoked permission is detected on the next visit and runs the same path as disabling.
- A5 Disabling runs `unsubscribe()`: token deleted, `deleteToken` called, documents and anonymous
  account removed, button absent, zero SDK loads afterwards.

### Identity and data
- B1 First enable signs in anonymously and writes only under the user's own `users/{uid}`.
- B2 Write order: user document (merge), settings, token.
- B3 Settings written: `notificationsEnabled`, `notificationTime`, `userTimezone` (browser),
  `preferredLanguage` (site i18n); always merge.
- B4 At most one refresh per 24 h per device of `lastLogin` and token `createdAt`.
- B5 Settings missing on a visit: everything is rewritten.
- B6 Token rotation: the old token document is deleted and the new one written.
- B7 Zero Firebase requests for users who never opted in.

### Delivery
- C1 Page and tab closed: the notification is shown once. Manual.
- C2 The production scheduler payload is shown in the user's language. Manual, with a screenshot and
  the function log as evidence.
- C3 Page visible: shown once, from the worker.
- C4 Clicking opens or focuses `/devocionales/` and closes the notification. Manual.
- C5 The worker shows the PWA icon. An image is not required.

### Integration
- D1 Existing offline, update and kill-switch behavior unchanged; existing tests green.
- D2 `pushEnabled: false` removes the button and runs `unsubscribe()` on the next visit.
- D3 New files only; generated worker and Tailwind rebuilt; CI drift checks pass.
- D4 New globals registered in `.eslintrc.json` in the same commit.
- D5 Old cached HTML with the new script, and new HTML with an old cached script, both stay safe: the
  button is hidden by default and no existing id is renamed.

### Quality
- E1 All gates pass: eslint, stylelint, html-validate, node tests, e2e (Chromium and WebKit), c8.
- E2 Negative tests: denied permission, offline during sign-in, repeated enable, in-flight enable,
  two tabs (exactly one token document), Firestore failure, token rotation.
- E3 An independent `/code-review` before merge.

## Out of scope for v1

Images, action buttons, more than one notification a day, Firefox and Safari desktop guarantees, iOS
automated tests, any change to the Flutter app or the Cloud Functions.

## Before launch (outside the code)

1. Create our own VAPID key pair (changing it later invalidates every token).
2. Restrict the web API key by HTTP referrer in the Google Cloud console.
3. Add budget alerts on Firestore reads and Functions.
4. Add the production and preview hosts to Authentication authorized domains.
5. Update the privacy page and add consent text next to the button.

## Accepted risks

- Any client can create anonymous users and settings (the rules do not validate fields), which adds
  load to the shared hourly full scan. Mitigated by the referrer restriction and budget alerts; real
  fixes (field validation rules, an indexed query) belong to the backend and are out of scope.
- A reader who is silent for 15 days is deleted by the existing cleanup, the same as in the app.
- Clearing site data (for example iOS eviction) creates a new user; the old one lingers until it is
  cleaned up.

## Merge gate

Do not merge, and do not enable `pushEnabled`, until C1 to C5 are proven on a real device.

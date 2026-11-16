# devocionales/vendor/firebase

Firebase JS SDK 11.0.2, compat build, self-hosted for the opt-in daily push notifications.
Do not edit by hand and do not lint (the whole `devocionales/vendor/` folder is excluded in `.eslintignore` and `.stylelintignore`).

| File | Source |
|---|---|
| `firebase-app-compat.js` | https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js |
| `firebase-auth-compat.js` | https://www.gstatic.com/firebasejs/11.0.2/firebase-auth-compat.js |
| `firebase-firestore-compat.js` | https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore-compat.js |
| `firebase-messaging-compat.js` | https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js |

License: Apache 2.0 (Google LLC, notice kept in the files).

## Loading

`devocionales/js/devotional-push-firebase.js` injects these as `<script>` tags, app first, only after
the reader opts in to notifications. They are never referenced from the page HTML, so they are
intentionally NOT in the service worker precache (about 550 kB that most readers never need).

## Updating

Download the four files from the URL pattern above with the new version in the path, replace them
together (the compat packages must share one version), bump the version in this file, and check the
opt-in flow end to end.

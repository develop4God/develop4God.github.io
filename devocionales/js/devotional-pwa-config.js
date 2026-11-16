(function (global) {
    'use strict';

    // The one place to switch the devocionales PWA features. The service worker fetches this file
    // fresh first, so a change reaches an online reader on their next visit; an offline reader
    // keeps the last copy until they are online again. Deploy it like any other file.
    global.DevotionalPwaConfig = Object.freeze({
        // Master switch. false = no service worker, no install button, no manifest, and any worker
        // or cache already installed in a reader's browser is removed on their next visit.
        enabled: true,
        // Kill switch for daily push notifications. false = the enable button is hidden, no Firebase
        // code is ever loaded, and a reader who had opted in is unsubscribed on their next visit.
        // This client kill switch is cleanup only: it runs when the installed app is reopened, so a
        // reader who never reopens it keeps a live token. The emergency stop is pushEnabled:false
        // PLUS a manual Firestore cleanup of tokens with platform == 'web' (the web store writes
        // platform:'web'; the Flutter app writes TargetPlatform.android).
        pushEnabled: false,
        // The installed app (iOS and desktop only, never Android, never a browser tab). The kill
        // switches above stay on top: enabled:false also removes the shell.
        surfaces: {
            shell: {
                // false = the installed app keeps the plain page, without tabs.
                enabled: true,
                // Tab names; each needs a [data-shell-tab] button in index.html.
                tabs: ['home', 'settings'],
                layout: {
                    // At or above this viewport width the tabs are a labelled rail, below it a bottom bar.
                    railMinWidth: 768,
                    // The reading column never grows past this many px.
                    contentMaxWidth: 720,
                },
                // The only mailto the installed app may hold (see devotional-shell-core.js).
                contactAddress: 'develop4God@gmail.com',
            },
        },
        // The Firebase WEB config. It is public by design (it ships to every browser); what protects
        // the backend is the API key's HTTP-referrer restriction and the Firestore security rules.
        firebase: {
            apiKey: 'AIzaSyDOSK8YZccYy8ws_3kREalQHf-2KPa4pUw',
            authDomain: 'devocional-app.firebaseapp.com',
            projectId: 'devocional-app',
            messagingSenderId: '758036195328',
            appId: '1:758036195328:web:481963a645bf08ab6450e5',
            // The Web Push (VAPID) PUBLIC key from Firebase console > Cloud Messaging. Public by
            // design; Firebase keeps the private half. Changing it later invalidates every token.
            vapidKey: 'BM7BGJ0debusvfW_B28DVQZD_Pr5X764EeSoNFU4nB9y16nlK2Rs4QAnWVRD2-_3dfaKrgd5JksaYGzya2Baye0',
        },
    });
})(window);

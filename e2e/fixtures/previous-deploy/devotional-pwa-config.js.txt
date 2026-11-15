(function (global) {
    'use strict';

    // The one place to switch the devocionales PWA features. The service worker fetches this file
    // fresh first, so a change reaches an online reader on their next visit; an offline reader
    // keeps the last copy until they are online again. Deploy it like any other file.
    global.DevotionalPwaConfig = Object.freeze({
        // Master switch. false = no service worker, no install button, no manifest, and any worker
        // or cache already installed in a reader's browser is removed on their next visit.
        enabled: true,
        // The native Android app is the offer on Android. Set true to offer the web app there too.
        installOnAndroid: false,
        // Kill switch for daily push notifications. false = the enable button is hidden, no Firebase
        // code is ever loaded, and a reader who had opted in is unsubscribed on their next visit.
        pushEnabled: false,
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

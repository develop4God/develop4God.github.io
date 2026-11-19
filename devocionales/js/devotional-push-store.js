(function (global) {
    'use strict';

    // Firestore writes of the daily push opt-in. They mirror, field for field, the Flutter app's
    // FirestoreUserProfileStore (devocional_nuevo/lib/services/user_profile_store.dart), so the
    // existing scheduler and cleanup jobs treat a browser like any app install. Every write merges;
    // lastNotificationSentDate is server-owned and never written here. The db is injected, so this
    // module knows nothing about Firebase and is tested with a fake.

    function requireText(value, name) {
        if (typeof value !== 'string' || value === '') throw new Error(`push store: ${name} is required`);
    }

    // The scheduler ignores minutes, so only whole hours are stored, as "HH:00".
    function formatHour(hour) {
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('push store: hour must be an integer 0-23');
        return `${String(hour).padStart(2, '0')}:00`;
    }

    function create({ db } = {}) {
        if (!db) throw new Error('push store: db is required');

        const tokenPath = (uid, token) => `users/${uid}/fcmTokens/${token}`;

        // updateLastLogin
        async function touchUser(uid) {
            requireText(uid, 'uid');
            await db.set(`users/${uid}`, { lastLogin: db.serverTimestamp() }, { merge: true });
        }

        // saveFcmToken: the raw token is the document id.
        async function saveToken(uid, token) {
            requireText(uid, 'uid');
            requireText(token, 'token');
            await db.set(tokenPath(uid, token), { token, createdAt: db.serverTimestamp(), platform: 'web' }, { merge: true });
        }

        // saveNotificationSettings. An unknown timezone, language or hour is left out so the
        // merge keeps whatever the document already has.
        async function saveSettings(uid, { notificationsEnabled, hour, timezone, language }) {
            requireText(uid, 'uid');
            const data = { notificationsEnabled, lastUpdated: db.serverTimestamp() };
            if (hour !== undefined) data.notificationTime = formatHour(hour);
            if (timezone) data.userTimezone = timezone;
            if (language) data.preferredLanguage = language;
            await db.set(`users/${uid}/settings/notifications`, data, { merge: true });
        }

        // removeFcmToken
        async function removeToken(uid, token) {
            requireText(uid, 'uid');
            requireText(token, 'token');
            await db.delete(tokenPath(uid, token));
        }

        return { touchUser, saveToken, saveSettings, removeToken };
    }

    global.DevotionalPushStore = { create, formatHour };
})(window);

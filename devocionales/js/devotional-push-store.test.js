const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
    const filename = path.join(__dirname, 'devotional-push-store.js');
    const source = fs.readFileSync(filename, 'utf8');
    const win = {};
    vm.runInThisContext(`(function(window){${source}\n})`, { filename })(win);
    return win.DevotionalPushStore;
}

const DevotionalPushStore = loadModule();
const STAMP = { stamp: true };

function fakeDb() {
    const calls = [];
    return {
        calls,
        serverTimestamp: () => STAMP,
        set(p, data, options) { calls.push({ op: 'set', path: p, data, options }); return Promise.resolve(); },
        delete(p) { calls.push({ op: 'delete', path: p }); return Promise.resolve(); },
    };
}

function setup() {
    const db = fakeDb();
    return { db, store: DevotionalPushStore.create({ db }) };
}

test('create requires a db', () => {
    assert.throws(() => DevotionalPushStore.create(), /db is required/);
});

test('touchUser mirrors updateLastLogin: users/{uid} { lastLogin } merged', async () => {
    const { db, store } = setup();
    await store.touchUser('u1');
    assert.deepEqual(db.calls, [{ op: 'set', path: 'users/u1', data: { lastLogin: STAMP }, options: { merge: true } }]);
});

test('saveSettings mirrors saveNotificationSettings with every field', async () => {
    const { db, store } = setup();
    await store.saveSettings('u1', { notificationsEnabled: true, hour: 7, timezone: 'America/Bogota', language: 'es' });
    assert.deepEqual(db.calls, [{
        op: 'set',
        path: 'users/u1/settings/notifications',
        data: {
            notificationsEnabled: true,
            notificationTime: '07:00',
            userTimezone: 'America/Bogota',
            lastUpdated: STAMP,
            preferredLanguage: 'es',
        },
        options: { merge: true },
    }]);
});

test('saveSettings omits an unknown timezone, language and hour, and never writes lastNotificationSentDate', async () => {
    const { db, store } = setup();
    await store.saveSettings('u1', { notificationsEnabled: false, timezone: '', language: undefined });
    assert.deepEqual(db.calls[0].data, { notificationsEnabled: false, lastUpdated: STAMP });
    assert.equal('lastNotificationSentDate' in db.calls[0].data, false);
});

test('saveSettings formats the hour as HH:00 and rejects an invalid one', async () => {
    const { db, store } = setup();
    await store.saveSettings('u1', { notificationsEnabled: true, hour: 0 });
    assert.equal(db.calls[0].data.notificationTime, '00:00');
    for (const hour of [24, -1, 1.5, '8', NaN]) {
        await assert.rejects(store.saveSettings('u1', { notificationsEnabled: true, hour }), /hour/);
    }
    assert.equal(db.calls.length, 1);
});

test('saveToken mirrors saveFcmToken: the raw token is the document id', async () => {
    const { db, store } = setup();
    await store.saveToken('u1', 'raw/token:1');
    assert.deepEqual(db.calls, [{
        op: 'set',
        path: 'users/u1/fcmTokens/raw/token:1',
        data: { token: 'raw/token:1', createdAt: STAMP, platform: 'web' },
        options: { merge: true },
    }]);
});

test('removeToken deletes only that token document', async () => {
    const { db, store } = setup();
    await store.removeToken('u1', 'tok');
    assert.deepEqual(db.calls, [{ op: 'delete', path: 'users/u1/fcmTokens/tok' }]);
});

test('an empty uid or token is rejected before any write', async () => {
    const { db, store } = setup();
    await assert.rejects(store.touchUser(''), /uid/);
    await assert.rejects(store.saveSettings(undefined, { notificationsEnabled: true }), /uid/);
    await assert.rejects(store.saveToken('u1', ''), /token/);
    await assert.rejects(store.removeToken('u1', null), /token/);
    assert.deepEqual(db.calls, []);
});

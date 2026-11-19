'use strict';

// "push.time_set" is read by every devotional-push.js a browser may still have cached (it appends the hour
// itself), so it must stay a plain sentence. The placeholder form lives under its own key.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'lang', 'devocionales');
const languages = fs.readdirSync(DIR).filter((file) => file.endsWith('.json'));

test('there are language files to check', () => {
    assert.equal(languages.length, 10);
});

for (const file of languages) {
    test(`${file}: time_set has no placeholder (cached scripts append the hour) and time_set_at has {time}`, () => {
        const { push } = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
        assert.ok(push.time_set && !push.time_set.includes('{time}'), 'time_set must stay a plain sentence');
        assert.ok(push.time_set_at && push.time_set_at.includes('{time}'), 'time_set_at must carry {time}');
    });
}

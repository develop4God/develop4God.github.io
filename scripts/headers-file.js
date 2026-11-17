'use strict';

// Reads a Cloudflare-style _headers file: an unindented path line followed by indented "Name: value" lines.

// The header block that applies to exactly `urlPath`, as a map of lower-cased names to values.
function headersFor(headersFile, urlPath) {
    const result = {};
    let current = null;
    for (const line of headersFile.split('\n')) {
        if (!line.trim()) continue;
        if (!/^\s/.test(line)) {
            current = line.trim();
            continue;
        }
        if (current !== urlPath) continue;
        const [name, ...value] = line.trim().split(':');
        result[name.toLowerCase()] = value.join(':').trim();
    }
    return result;
}

module.exports = { headersFor };

'use strict';

// A small, tolerant HTML tokenizer for scripts/build-sw.js. The repo has no dependencies by
// design, and the build only needs each tag's name and attributes (plus the raw text of <script>
// and <style>), so this follows the HTML tokenizing rules that matter for that: quoted, single
// quoted and unquoted values, a ">" inside a quoted value, comments, raw-text elements and
// repeated attributes. Anything it cannot make sense of (an unterminated tag, quote, comment or
// raw-text element) throws instead of being skipped, so the build never silently drops a
// reference.

const RAW_TEXT = new Set(['script', 'style']);
const NAME_END = /[\s/>=]/;

function fail(html, offset, problem) {
    throw new Error(`Cannot parse HTML: ${problem} at offset ${offset}`);
}

const isSpace = (char) => /\s/.test(char);

// Reads one tag starting just after "<name" (errors point at `tagStart`); returns its attributes and the offset after ">".
function readAttributes(html, start, tagStart) {
    const attrs = {};
    let i = start;
    for (;;) {
        while (i < html.length && (isSpace(html[i]) || html[i] === '/')) i += 1;
        if (i >= html.length) fail(html, tagStart, 'unterminated tag');
        if (html[i] === '>') return { attrs, end: i + 1 };
        const nameStart = i;
        i += 1; // a stray "=" or quote at the start is part of the name, as in browsers
        while (i < html.length && !NAME_END.test(html[i])) i += 1;
        const name = html.slice(nameStart, i).toLowerCase();
        while (i < html.length && isSpace(html[i])) i += 1;
        let value = '';
        if (html[i] === '=') {
            i += 1;
            while (i < html.length && isSpace(html[i])) i += 1;
            if (i >= html.length) fail(html, tagStart, 'unterminated tag');
            const quote = html[i];
            if (quote === '"' || quote === "'") {
                const close = html.indexOf(quote, i + 1);
                if (close === -1) fail(html, tagStart, 'unterminated attribute value');
                value = html.slice(i + 1, close);
                i = close + 1;
            } else {
                const valueStart = i;
                while (i < html.length && !isSpace(html[i]) && html[i] !== '>') i += 1;
                value = html.slice(valueStart, i);
            }
        }
        if (!(name in attrs)) attrs[name] = value; // the first of a repeated attribute wins
    }
}

// Every start tag in `html`, in order: { name, attrs, body }. `body` is the raw text of <script>
// and <style> and undefined for other tags.
function parseTags(html) {
    const tags = [];
    let i = 0;
    while (i < html.length) {
        const open = html.indexOf('<', i);
        if (open === -1) break;
        if (html.startsWith('<!--', open)) {
            const close = html.indexOf('-->', open + 2);
            // From open + 2, so <!--> and <!---> are the empty comments the HTML spec says they are.
            if (close === -1) fail(html, open, 'unterminated comment');
            i = close + 3;
        } else if (/<[!?/]/.test(html.slice(open, open + 2))) { // doctype, processing instruction, closing tag
            const close = html.indexOf('>', open);
            if (close === -1) fail(html, open, 'unterminated declaration or closing tag');
            i = close + 1;
        } else if (/[A-Za-z]/.test(html[open + 1] || '')) {
            let nameEnd = open + 1;
            while (nameEnd < html.length && !NAME_END.test(html[nameEnd])) nameEnd += 1;
            const name = html.slice(open + 1, nameEnd).toLowerCase();
            const { attrs, end } = readAttributes(html, nameEnd, open);
            const tag = { name, attrs, body: undefined };
            i = end;
            if (RAW_TEXT.has(name)) {
                const close = html.slice(end).search(new RegExp(`</${name}[\\s/>]`, 'i'));
                if (close === -1) fail(html, open, `<${name}> is never closed`);
                tag.body = html.slice(end, end + close);
                i = end + close;
            }
            tags.push(tag);
        } else {
            i = open + 1; // a lone "<" in text
        }
    }
    return tags;
}

module.exports = { parseTags };

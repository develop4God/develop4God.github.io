'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};

function makeFakeElement(tagName, ownerFooter) {
    const el = {
        tagName,
        textContent: '',
        dataset: {},
        children: [],
        className: '',
        childNodes: [],
        appendChild(node) {
            el.childNodes.push(node);
            return node;
        },
        remove() {
            const index = ownerFooter.children.indexOf(el);
            if (index !== -1) ownerFooter.children.splice(index, 1);
        },
    };
    return el;
}

// Text of a node, whether it was set with textContent or built from child nodes.
function textOf(node) {
    if (node.nodeType === 3) return node.data;
    if (node.childNodes && node.childNodes.length) return node.childNodes.map(textOf).join('');
    return node.textContent;
}

function fakeDocument(footer) {
    return {
        createElement: (tag) => makeFakeElement(tag, footer),
        createTextNode: (data) => ({ nodeType: 3, data }),
    };
}

function makeFakeFooter(initialChildren) {
    const footer = {
        children: [...initialChildren],
        get firstChild() {
            return this.children[0] || null;
        },
        insertBefore(newNode, referenceNode) {
            const index = referenceNode === null ? this.children.length : this.children.indexOf(referenceNode);
            this.children.splice(index, 0, newNode);
            return newNode;
        },
        querySelectorAll(selector) {
            if (selector !== '[data-site-footer-line]') throw new Error(`unsupported selector: ${selector}`);
            return footer.children.filter((el) => el.dataset.siteFooterLine !== undefined);
        },
    };
    return footer;
}

const filename = path.join(__dirname, 'site-footer.js');
const source = fs.readFileSync(filename, 'utf8');
vm.runInThisContext(`(function(window){${source}\n})`, { filename })(global.window);
const { renderSharedLines } = global.window.SiteFooter;

test('renderSharedLines: does nothing when footerEl is null', () => {
    assert.doesNotThrow(() => renderSharedLines(null, { copyright: 'c', madeWith: 'm' }));
});

test('renderSharedLines: inserts copyright then made-with as the first two children, in order', () => {
    const footer = makeFakeFooter([]);
    global.document = fakeDocument(footer);
    const existingLine = makeFakeElement('p', footer);
    existingLine.textContent = 'page-specific contact line';
    footer.children.push(existingLine);

    renderSharedLines(footer, {
        copyright: '© 2026 Develop4God. Todos los derechos reservados.',
        madeWith: 'Desarrollado con ♥️ por develop4God',
    });

    assert.equal(footer.children.length, 3);
    assert.equal(textOf(footer.children[0]), '© 2026 Develop4God. Todos los derechos reservados.');
    assert.equal(footer.children[1].textContent, 'Desarrollado con ♥️ por develop4God');
    assert.equal(footer.children[2], existingLine);
});

test('renderSharedLines: works on an empty footer', () => {
    const footer = makeFakeFooter([]);
    global.document = fakeDocument(footer);

    renderSharedLines(footer, { copyright: 'C', madeWith: 'M' });

    assert.equal(footer.children.length, 2);
    assert.equal(footer.children[0].textContent, 'C');
    assert.equal(footer.children[1].textContent, 'M');
});

test('renderSharedLines: re-rendering (e.g. language switch) replaces shared lines instead of stacking them', () => {
    const footer = makeFakeFooter([]);
    global.document = fakeDocument(footer);
    const contactLine = makeFakeElement('p', footer);
    contactLine.textContent = 'Contacto';
    footer.children.push(contactLine);

    renderSharedLines(footer, { copyright: '© Español', madeWith: 'Hecho con amor' });
    renderSharedLines(footer, { copyright: '© Português', madeWith: 'Feito com amor' });

    assert.equal(footer.children.length, 3);
    assert.equal(footer.children[0].textContent, '© Português');
    assert.equal(footer.children[1].textContent, 'Feito com amor');
    assert.equal(footer.children[2], contactLine);
});

// --- Branded "Develop4God" in the copyright line ------------------------------------------------

function brandParts(copyrightEl) {
    const brand = copyrightEl.childNodes.find((n) => n.className === 'site-footer-brand');
    return brand ? brand.childNodes.map((n) => ({ cls: n.className, text: n.textContent })) : null;
}

test('copyright: Develop4God is split into three colour-able parts, the text around it is kept', () => {
    const footer = makeFakeFooter([]);
    global.document = fakeDocument(footer);

    renderSharedLines(footer, { copyright: '© 2026 Develop4God. All rights reserved.', madeWith: 'm' });

    const line = footer.children[0];
    assert.equal(textOf(line), '© 2026 Develop4God. All rights reserved.');
    assert.deepEqual(brandParts(line), [
        { cls: 'site-footer-dev', text: 'Develop' },
        { cls: 'site-footer-4', text: '4' },
        { cls: 'site-footer-god', text: 'God' },
    ]);
});

test('copyright: works when the brand is not at the start (any language word order)', () => {
    const footer = makeFakeFooter([]);
    global.document = fakeDocument(footer);

    renderSharedLines(footer, { copyright: 'جميع الحقوق محفوظة © Develop4God 2026', madeWith: 'm' });

    assert.equal(textOf(footer.children[0]), 'جميع الحقوق محفوظة © Develop4God 2026');
    assert.notEqual(brandParts(footer.children[0]), null);
});

test('copyright: a string without the brand stays plain text and does not throw', () => {
    const footer = makeFakeFooter([]);
    global.document = fakeDocument(footer);

    assert.doesNotThrow(() => renderSharedLines(footer, { copyright: '© 2026', madeWith: 'm' }));
    assert.equal(footer.children[0].textContent, '© 2026');
    assert.equal(brandParts(footer.children[0]), null);
});

test('copyright: the brand is created once per line, never duplicated on re-render', () => {
    const footer = makeFakeFooter([]);
    global.document = fakeDocument(footer);

    renderSharedLines(footer, { copyright: '© Develop4God', madeWith: 'm' });
    renderSharedLines(footer, { copyright: '© Develop4God', madeWith: 'm' });

    assert.equal(footer.children.filter((c) => c.dataset.siteFooterLine === 'copyright').length, 1);
});

test('copyright: the colour rules are added to the page once, with a light and a dark palette', () => {
    const added = [];
    const footer = makeFakeFooter([]);
    global.document = {
        ...fakeDocument(footer),
        head: { appendChild: (n) => added.push(n) },
        getElementById: (id) => added.find((n) => n.id === id) || null,
    };

    renderSharedLines(footer, { copyright: '© Develop4God', madeWith: 'm' });
    renderSharedLines(footer, { copyright: '© Develop4God', madeWith: 'm' });

    assert.equal(added.length, 1);
    const css = added[0].textContent;
    assert.match(css, /\.site-footer-4/);
    assert.match(css, /data-theme="dark"/);
    assert.match(css, /prefers-color-scheme: dark/);
});

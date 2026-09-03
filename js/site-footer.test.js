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
        remove() {
            const index = ownerFooter.children.indexOf(el);
            if (index !== -1) ownerFooter.children.splice(index, 1);
        },
    };
    return el;
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
    global.document = { createElement: (tag) => makeFakeElement(tag, footer) };
    const existingLine = makeFakeElement('p', footer);
    existingLine.textContent = 'page-specific contact line';
    footer.children.push(existingLine);

    renderSharedLines(footer, {
        copyright: '© 2026 Develop4God. Todos los derechos reservados.',
        madeWith: 'Desarrollado con ♥️ por develop4God',
    });

    assert.equal(footer.children.length, 3);
    assert.equal(footer.children[0].textContent, '© 2026 Develop4God. Todos los derechos reservados.');
    assert.equal(footer.children[1].textContent, 'Desarrollado con ♥️ por develop4God');
    assert.equal(footer.children[2], existingLine);
});

test('renderSharedLines: works on an empty footer', () => {
    const footer = makeFakeFooter([]);
    global.document = { createElement: (tag) => makeFakeElement(tag, footer) };

    renderSharedLines(footer, { copyright: 'C', madeWith: 'M' });

    assert.equal(footer.children.length, 2);
    assert.equal(footer.children[0].textContent, 'C');
    assert.equal(footer.children[1].textContent, 'M');
});

test('renderSharedLines: re-rendering (e.g. language switch) replaces shared lines instead of stacking them', () => {
    const footer = makeFakeFooter([]);
    global.document = { createElement: (tag) => makeFakeElement(tag, footer) };
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

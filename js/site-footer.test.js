'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global.window || {};

function makeFakeElement(tagName) {
    return {
        tagName,
        textContent: '',
        children: [],
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
    global.document = {
        createElement: (tag) => makeFakeElement(tag),
    };
    const existingLine = makeFakeElement('p');
    existingLine.textContent = 'page-specific contact line';
    const footer = makeFakeFooter([existingLine]);

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
    global.document = {
        createElement: (tag) => makeFakeElement(tag),
    };
    const footer = makeFakeFooter([]);

    renderSharedLines(footer, { copyright: 'C', madeWith: 'M' });

    assert.equal(footer.children.length, 2);
    assert.equal(footer.children[0].textContent, 'C');
    assert.equal(footer.children[1].textContent, 'M');
});

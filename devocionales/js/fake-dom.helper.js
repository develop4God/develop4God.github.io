/* eslint-env node */
'use strict';

// Minimal in-memory DOM used by unit tests of the DOM-building modules. It implements only
// what those modules call (createElement, classList, attributes, append, events, querySelector
// by class/tag/attr), so tests run real module code against real element behaviour with no
// jsdom dependency (the repo has zero npm dependencies by design).
class FakeElement {
    constructor(tag, doc) {
        this.tagName = tag.toUpperCase();
        this.ownerDocument = doc;
        this.children = [];
        this.parentElement = null;
        this.attributes = {};
        this.listeners = {};
        this.style = {};
        this._text = '';
        const set = new Set();
        this.classSet = set;
        this.classList = {
            add: (...c) => c.forEach((x) => set.add(x)),
            remove: (...c) => c.forEach((x) => set.delete(x)),
            toggle: (c, on) => { const want = on === undefined ? !set.has(c) : on; if (want) set.add(c); else set.delete(c); return want; },
            contains: (c) => set.has(c),
        };
    }

    get className() { return [...this.classSet].join(' '); }
    set className(v) { this.classSet.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classSet.add(c)); }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this.children = []; this._text = String(v); }
    get id() { return this.attributes.id || ''; }
    set id(v) { this.attributes.id = String(v); }
    get hidden() { return 'hidden' in this.attributes; }
    set hidden(v) { if (v) this.attributes.hidden = ''; else delete this.attributes.hidden; }

    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
    removeAttribute(k) { delete this.attributes[k]; }
    hasAttribute(k) { return k in this.attributes; }

    append(...nodes) {
        nodes.forEach((n) => {
            if (n === null || n === undefined || n === false) return;
            if (typeof n === 'string') { this._text += n; return; }
            n.parentElement = this;
            this.children.push(n);
        });
    }

    replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this); }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    dispatch(type, extra = {}) {
        const event = { type, target: this, defaultPrevented: false, propagationStopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...extra };
        let node = this;
        while (node) {
            (node.listeners[type] || []).forEach((fn) => fn(event));
            if (event.propagationStopped) break;
            node = node.parentElement;
        }
        return event;
    }
    click() { return this.dispatch('click'); }
    focus() { this.ownerDocument.activeElement = this; }

    contains(node) { for (let n = node; n; n = n.parentElement) if (n === this) return true; return false; }

    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
    matches(sel) {
        if (sel.startsWith('.')) return this.classSet.has(sel.slice(1));
        const attr = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
        if (attr) return attr[2] === undefined ? this.hasAttribute(attr[1]) : this.getAttribute(attr[1]) === attr[2];
        return this.tagName === sel.toUpperCase();
    }
    // Supports simple selectors and descendant chains ("[data-id=\"a\"] .fav").
    querySelectorAll(sel) {
        const parts = sel.trim().split(/\s+/);
        const last = parts.pop();
        return this.all().filter((e) => {
            if (!e.matches(last)) return false;
            let node = e.parentElement;
            for (let i = parts.length - 1; i >= 0; i--) {
                while (node && node !== this && !node.matches(parts[i])) node = node.parentElement;
                if (!node || node === this) return false;
                node = node.parentElement;
            }
            return true;
        });
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

class FakeDocument {
    constructor() { this.body = new FakeElement('body', this); this.activeElement = this.body; }
    createElement(tag) { return new FakeElement(tag, this); }
}

module.exports = { FakeDocument, FakeElement };

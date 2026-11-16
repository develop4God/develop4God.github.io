(function (global) {
    'use strict';

    // Safe element factory: text always goes through textContent and attributes through
    // setAttribute, so remote strings can never be parsed as HTML (the reader's older
    // renderers use innerHTML; new modules must not).
    function createBuilder(doc) {
        return function h(tag, { class: className, text, attrs, on } = {}, children = []) {
            const el = doc.createElement(tag);
            if (className) el.className = className;
            if (text !== undefined && text !== null) el.textContent = text;
            Object.entries(attrs || {}).forEach(([k, v]) => {
                if (v !== undefined && v !== null) el.setAttribute(k, v);
            });
            Object.entries(on || {}).forEach(([type, fn]) => el.addEventListener(type, fn));
            el.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
            return el;
        };
    }

    global.DomBuilder = { createBuilder };
})(window);

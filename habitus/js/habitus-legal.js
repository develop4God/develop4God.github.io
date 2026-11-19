// Renders the body of the Habitus+Faith legal pages (privacy policy, terms and conditions) from the
// `legal.<kind>` block of the live-fetched /lang/habitus/{lang}.json. Own module so habitus-i18n.js
// stays a generic data-i18n applier. Nodes are built with DomBuilder, so remote strings are text and
// never parsed as HTML.
(function (window) {
  'use strict';

  const MAX_SECTIONS = 10;
  const MAX_LIST_ITEMS = 20;

  function buildItem(h, doc, key, i) {
    const flat = doc[`${key}_list${i}`];
    const title = doc[`${key}_list${i}_title`];
    const text = doc[`${key}_list${i}_text`];
    const purpose = doc[`${key}_list${i}_purpose`];
    const purposeText = doc[`${key}_list${i}_purpose_text`];
    if (flat) return h('li', { text: flat });
    if (!title && !text) return null;
    const children = [];
    if (title) children.push(h('strong', { text: title }), ' ');
    if (text) children.push(text);
    if (purpose) {
      children.push(h('ul', {}, [h('li', {}, [h('strong', { text: purpose }), ` ${purposeText || ''}`])]));
    }
    return h('li', {}, children);
  }

  function buildList(h, doc, key) {
    const items = [];
    for (let i = 1; i <= MAX_LIST_ITEMS; i++) {
      const item = buildItem(h, doc, key, i);
      if (item) items.push(item);
    }
    return items.length ? h('ul', {}, items) : null;
  }

  function buildNote(h, doc) {
    if (!doc.important_note_title && !doc.important_note_text) return null;
    return h('p', {}, [h('strong', { text: doc.important_note_title || '' }), ` ${doc.important_note_text || ''}`]);
  }

  // Intro paragraph each kind starts with; the title and the "last updated" line are data-i18n markup.
  const INTRO_KEY = { terms: 'welcome', privacy: 'description' };

  function buildLegalBody(document, kind, legal) {
    if (!legal || !INTRO_KEY[kind]) return [];
    const h = window.DomBuilder.createBuilder(document);
    const nodes = [];
    const push = (tag, text) => { if (text) nodes.push(h(tag, { text })); };

    push('p', legal[INTRO_KEY[kind]]);
    for (let s = 1; s <= MAX_SECTIONS; s++) {
      const key = `section${s}`;
      push('h2', legal[`${key}_title`]);
      push('p', legal[`${key}_text`]);
      for (const sub of [1, 2]) {
        push('h3', legal[`${key}_${sub}_title`]);
        push('p', legal[`${key}_${sub}_text`]);
      }
      const list = buildList(h, legal, key);
      if (list) nodes.push(list);
      const note = s === 1 && kind === 'privacy' ? buildNote(h, legal) : null;
      if (note) nodes.push(note);
    }
    return nodes;
  }

  function render(document, container, translations) {
    const kind = container.getAttribute('data-legal-kind');
    container.replaceChildren(...buildLegalBody(document, kind, translations && translations.legal && translations.legal[kind]));
  }

  const container = document.getElementById('legal-content');
  if (container && window.HabitusI18n) {
    window.HabitusI18n.onTranslationsApplied((translations) => render(document, container, translations));
  }

  window.HabitusLegal = { buildLegalBody, render };
})(window);

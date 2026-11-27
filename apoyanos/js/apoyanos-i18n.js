// Apóyanos page i18n. Fetches /lang/apoyanos/{lang}.json and applies it to the page:
//   data-i18n="key"                  sets the element's text (Spanish in the HTML is the no-JS fallback);
//   data-i18n="key" + child elements marked data-i18n-slot="name" keep their markup: the key's text holds
//                                    {name} markers where each child goes, so word order can differ per language;
//   data-i18n-attr="attr:key"        sets an attribute, e.g. aria-label:give.yappyAria.
// Page scripts read their own strings through t(key, params) after `ready` resolves.
(function (window, document, navigator, localStorage) {
  'use strict';

  const DEFAULT_LANGUAGE = 'en';
  // Languages that have a /lang/apoyanos file; add a code here when its file ships.
  const SUPPORTED = ['es', 'en'];
  const STORAGE_KEY = 'develop4God_language'; // shared with the other sections of the site
  const PLACEHOLDER = /\{(\w+)\}/g;

  let translations = {};

  function pickLanguage({ saved, browser }) {
    if (SUPPORTED.includes(saved)) return saved;
    const short = String(browser || '').split('-')[0].toLowerCase();
    return SUPPORTED.includes(short) ? short : DEFAULT_LANGUAGE;
  }

  function lookup(tree, key) {
    let value = tree;
    for (const part of key.split('.')) {
      if (value && typeof value === 'object' && part in value) value = value[part];
      else return null;
    }
    return typeof value === 'string' ? value : null;
  }

  // A function replacer, so "$&" in a value is text and not a replacement pattern.
  function interpolate(text, params) {
    return text.replace(PLACEHOLDER, (whole, name) => (params && name in params ? String(params[name]) : whole));
  }

  function splitSlots(text) {
    const parts = [];
    let last = 0;
    for (const match of text.matchAll(PLACEHOLDER)) {
      if (match.index > last) parts.push({ text: text.slice(last, match.index) });
      parts.push({ slot: match[1] });
      last = match.index + match[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
  }

  function t(key, params) {
    const text = lookup(translations, key);
    return text === null ? key : interpolate(text, params);
  }

  function setText(element, text) {
    const slotted = element.querySelectorAll(':scope > [data-i18n-slot]');
    if (!slotted.length) {
      element.textContent = text;
      return;
    }
    const bySlot = {};
    slotted.forEach((child) => { bySlot[child.getAttribute('data-i18n-slot')] = child; });
    element.replaceChildren(...splitSlots(text).map((part) =>
      part.slot ? bySlot[part.slot] : document.createTextNode(part.text)).filter(Boolean));
  }

  function apply() {
    const title = lookup(translations, 'meta.title');
    if (title) document.title = title;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const text = lookup(translations, element.getAttribute('data-i18n'));
      if (text !== null) setText(element, text);
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((element) => {
      const [attribute, key] = element.getAttribute('data-i18n-attr').split(':');
      const text = lookup(translations, key);
      if (text !== null) element.setAttribute(attribute, text);
    });
  }

  async function fetchLanguage(lang) {
    const response = await window.fetch(`/lang/apoyanos/${lang}.json`);
    if (!response.ok) throw new Error(`apoyanos i18n: ${lang} not available`);
    return response.json();
  }

  async function init() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (error) { /* storage blocked: use the browser language */ }
    let lang = pickLanguage({ saved, browser: navigator.language });
    try {
      translations = await fetchLanguage(lang);
    } catch (error) {
      // The fallback is the language the page is written in, so a failed load leaves it readable.
      lang = 'es';
      translations = await fetchLanguage(lang).catch(() => ({}));
    }
    apply();
    if (window.RtlHelper) window.RtlHelper.applyDirection(lang);
  }

  // A rejected load must not stop the page scripts that wait on it.
  const ready = init().catch(() => {});

  window.ApoyanosI18n = { ready, t, pickLanguage, interpolate, lookup, splitSlots, SUPPORTED };
})(window, document, navigator, localStorage);

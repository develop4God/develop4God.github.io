// Shared footer rendering used by every page on the site (root, devocionales,
// habitus, work-with-me). Renders the two lines common to all footers
// (copyright, made-with-love) into a #page-footer element; page-specific
// content (contact link, privacy/terms links, back-to-hub, etc.) stays as
// markup each page writes itself, alongside this shared block.
//
// Deliberately takes the text as parameters instead of owning translations
// itself — each page's own i18n system (or, for pages without one yet,
// its lang/*.json values directly) is the source of truth for the strings;
// this module only owns the shared DOM structure.
(function (window) {
  'use strict';

  const BRAND = 'Develop4God';
  const STYLE_ID = 'site-footer-style';

  // The brand is coloured in the home's palette: "Develop" in the page text colour, "4" and "God"
  // in the brand lime and gold. Each palette is picked for contrast on its own background, so
  // light and dark mode differ. `--text` is the page text colour on every page that uses this.
  // Pages force every colour inside #page-footer with !important (modern.css does too), so these
  // rules are scoped to #page-footer and carry !important to win.
  const STYLE = [
    '#page-footer .site-footer-brand { font-weight: 700; }',
    '#page-footer .site-footer-dev { color: var(--text, inherit) !important; }',
    '#page-footer .site-footer-4 { color: #4f6f00 !important; }',
    '#page-footer .site-footer-god { color: #8a5a00 !important; }',
    ':root[data-theme="dark"] #page-footer .site-footer-4 { color: #84cc16 !important; }',
    ':root[data-theme="dark"] #page-footer .site-footer-god { color: #d4a017 !important; }',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) #page-footer .site-footer-4 { color: #84cc16 !important; }',
    '  :root:not([data-theme="light"]) #page-footer .site-footer-god { color: #d4a017 !important; }',
    '}',
  ].join('\n');

  function ensureStyle() {
    if (!document.head || !document.getElementById) return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function brandElement() {
    const brand = document.createElement('span');
    brand.className = 'site-footer-brand';
    [['site-footer-dev', 'Develop'], ['site-footer-4', '4'], ['site-footer-god', 'God']].forEach(([cls, text]) => {
      const part = document.createElement('span');
      part.className = cls;
      part.textContent = text;
      brand.appendChild(part);
    });
    return brand;
  }

  // Fills the line with the translated text, colouring the brand wherever it sits in the sentence.
  function fillCopyright(el, text) {
    const at = text.indexOf(BRAND);
    if (at === -1) {
      el.textContent = text;
      return;
    }
    el.appendChild(document.createTextNode(text.slice(0, at)));
    el.appendChild(brandElement());
    el.appendChild(document.createTextNode(text.slice(at + BRAND.length)));
    ensureStyle();
  }

  function renderSharedLines(footerEl, { copyright, madeWith }) {
    if (!footerEl) return;

    footerEl.querySelectorAll('[data-site-footer-line]').forEach((el) => el.remove());

    const copyrightEl = document.createElement('p');
    copyrightEl.dataset.siteFooterLine = 'copyright';
    fillCopyright(copyrightEl, copyright);

    const madeWithEl = document.createElement('p');
    madeWithEl.dataset.siteFooterLine = 'madeWith';
    madeWithEl.textContent = madeWith;

    footerEl.insertBefore(madeWithEl, footerEl.firstChild);
    footerEl.insertBefore(copyrightEl, madeWithEl);
  }

  window.SiteFooter = { renderSharedLines };
})(window);

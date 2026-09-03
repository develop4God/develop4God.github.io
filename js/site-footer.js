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

  function renderSharedLines(footerEl, { copyright, madeWith }) {
    if (!footerEl) return;

    footerEl.querySelectorAll('[data-site-footer-line]').forEach((el) => el.remove());

    const copyrightEl = document.createElement('p');
    copyrightEl.dataset.siteFooterLine = 'copyright';
    copyrightEl.textContent = copyright;

    const madeWithEl = document.createElement('p');
    madeWithEl.dataset.siteFooterLine = 'madeWith';
    madeWithEl.textContent = madeWith;

    footerEl.insertBefore(madeWithEl, footerEl.firstChild);
    footerEl.insertBefore(copyrightEl, madeWithEl);
  }

  window.SiteFooter = { renderSharedLines };
})(window);

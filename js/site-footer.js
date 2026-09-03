// Shared footer content used by every page on the site (root, devocionales,
// habitus, work-with-me). Renders the two lines common to all footers
// (copyright, made-with-love) into a #page-footer element; page-specific
// content (contact link, privacy/terms links, back-to-hub, etc.) stays as
// markup each page writes itself, alongside this shared block.
(function (window) {
  'use strict';

  const COPYRIGHT_TEXT = '© 2026 Develop4God. Todos los derechos reservados.';
  const MADE_WITH_TEXT = 'Desarrollado con ♥️ por develop4God';

  function renderSharedLines(footerEl) {
    if (!footerEl) return;

    const copyright = document.createElement('p');
    copyright.textContent = COPYRIGHT_TEXT;

    const madeWith = document.createElement('p');
    madeWith.textContent = MADE_WITH_TEXT;

    footerEl.insertBefore(madeWith, footerEl.firstChild);
    footerEl.insertBefore(copyright, madeWith);
  }

  window.SiteFooter = { renderSharedLines, COPYRIGHT_TEXT, MADE_WITH_TEXT };
})(window);

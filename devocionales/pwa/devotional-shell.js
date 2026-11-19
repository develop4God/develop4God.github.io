(function (global) {
    'use strict';

    // The installed-app shell: Home, Studies and Settings tabs as a bottom bar (phone) or a labelled
    // rail (tablet and desktop). The bar is generated from ONE tab table (devotional-shell-core.js): on the
    // reader Home and Settings are panels and Studies is a link; on the Bible-studies page all are links. It only reveals markup already in index.html and toggles classes and
    // attributes on <html>; the rules live in devotional-shell-core.js and the look in shell.css.
    // Nothing is persisted: the app always opens on Home.

    const ANALYTICS_EVENT = 'bottom_bar_action';

    // Controls that live in the header and on the reading page in a browser tab and in Settings in the
    // installed app. The existing elements are moved, never copied or recreated: the scripts that read
    // them by id (language selector, theme toggle, font size radios) keep working untouched.
    // The row label names the control: a group for the language list and the font radios (they hold
    // several buttons), the label itself for the theme switch (its checkbox is display:none).
    const SETTINGS_CONTROLS = [
        { slot: 'language', selector: '#language-selector' },
        { slot: 'theme', selector: '.theme-switch', group: false },
        { slot: 'font', selector: '.text-size-toggle' },
    ];

    function moveControlsToSettings(doc) {
        SETTINGS_CONTROLS.forEach(({ slot, selector, group = true }) => {
            const target = doc.querySelector(`[data-shell-slot="${slot}"]`);
            const control = doc.querySelector(selector);
            if (!target || !control) return;
            if (!target.contains(control)) target.appendChild(control);
            const label = target.querySelector('.settings-label');
            if (!label || !label.id) return;
            control.setAttribute('aria-labelledby', label.id);
            if (group) control.setAttribute('role', 'group');
        });
    }

    function track(win, tab) {
        if (typeof win.gtag === 'function') win.gtag('event', ANALYTICS_EVENT, { action: tab });
    }

    function applyLayout(root, win, layout) {
        if (layout.railMinWidth && typeof win.matchMedia === 'function') {
            const query = win.matchMedia(`(min-width: ${layout.railMinWidth}px)`);
            const renderLayout = () => { root.dataset.shellLayout = query.matches ? 'rail' : 'bar'; };
            renderLayout();
            if (typeof query.addEventListener === 'function') query.addEventListener('change', renderLayout);
        } else {
            root.dataset.shellLayout = 'bar';
        }
    }

    // The bar is generated from the one tab table (devotional-shell-core.js tabsForPage), so the
    // reader and the Bible-studies page always show the same shell. Labels use data-i18n (kept in
    // step by the page's language switch) plus the current text for the first paint.
    function renderNav(doc, win, nav, tabs) {
        const t = global.DevotionalI18n && typeof global.DevotionalI18n.t === 'function' ? global.DevotionalI18n.t : null;
        const label = doc.createElement('span');
        label.id = 'shell-nav-label';
        label.className = 'sr-only';
        label.setAttribute('data-i18n', 'shell.nav_label');
        label.textContent = t ? t('shell.nav_label', 'App navigation') : 'App navigation';
        const items = tabs.map((tab) => {
            const el = doc.createElement(tab.kind === 'panel' ? 'button' : 'a');
            el.className = 'shell-tab';
            el.setAttribute('data-shell-tab', tab.name);
            if (tab.kind === 'panel') {
                el.setAttribute('type', 'button');
                el.setAttribute('aria-controls', tab.controls);
            } else {
                el.setAttribute('href', tab.href);
                if (tab.current) el.setAttribute('aria-current', 'page');
            }
            const icon = doc.createElement('i');
            icon.setAttribute('data-lucide', tab.icon);
            icon.className = 'shell-tab-icon';
            const text = doc.createElement('span');
            text.setAttribute('data-i18n', tab.labelKey);
            text.textContent = t ? t(tab.labelKey, tab.fallback) : tab.fallback;
            el.append(icon, text);
            return el;
        });
        nav.removeAttribute('aria-label'); // the static name only exists for the HTML validator and a no-JS reader
        nav.setAttribute('aria-labelledby', label.id);
        nav.replaceChildren(label, ...items);
        if (win.lucide && typeof win.lucide.createIcons === 'function') win.lucide.createIcons();
        return items;
    }

    // Returns whether the shell was started. A page without the shell placeholder (an older
    // cached HTML) stays as it is.
    function init(doc, win, config) {
        const core = global.DevotionalShellCore;
        if (!core || !core.isShellSurface(win, config)) return false;
        const nav = doc.querySelector('[data-shell-nav]');
        if (!nav || !nav.dataset.shellPage) return false;

        const shell = config.surfaces.shell;
        const root = doc.documentElement;
        const layout = shell.layout || {};
        const tabs = core.tabsForPage(nav.dataset.shellPage, shell.tabs);
        if (!tabs.length) return false;
        const settings = doc.querySelector('[data-shell-settings]');
        const isReader = nav.dataset.shellPage === 'reader';
        if (isReader && !settings) return false;

        const panelTabs = tabs.filter((tab) => tab.kind === 'panel').map((tab) => tab.name);
        const state = core.createTabState(panelTabs, core.resolveInitialTab(win.location && win.location.hash, panelTabs));
        // The reader needs at least one panel tab (Home or Settings) to have something to show; a page of links only needs the bar.
        if (isReader && state.current() === null) return false;

        const elements = renderNav(doc, win, nav, tabs);
        const panelButtons = elements.filter((el) => el.tagName === 'BUTTON');
        if (layout.contentMaxWidth) root.style.setProperty('--shell-content-max', `${layout.contentMaxWidth}px`);

        if (isReader) {
            const renderTab = () => {
                root.dataset.shellView = state.current();
                panelButtons.forEach((button) => {
                    if (button.dataset.shellTab === state.current()) button.setAttribute('aria-current', 'page');
                    else button.removeAttribute('aria-current');
                });
            };
            renderTab();
            panelButtons.forEach((button) => button.addEventListener('click', () => {
                if (!state.select(button.dataset.shellTab)) return;
                renderTab();
                track(win, state.current());
                // Arrived through /devocionales/#settings: leaving Settings must not leave the hash behind, or a reload reopens it.
                if (state.current() === 'home' && win.location.hash === '#settings') {
                    win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search);
                }
            }));
            moveControlsToSettings(doc);
        }

        // A link tab leaves the page, so it is reported on tap (the navigation then proceeds normally).
        elements.filter((el) => el.tagName === 'A').forEach((link) => link.addEventListener('click', () => track(win, link.dataset.shellTab)));

        applyLayout(root, win, layout);
        root.classList.add('shell-active');
        return true;
    }

    global.DevotionalShell = { init };
})(window);

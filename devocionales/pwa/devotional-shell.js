(function (global) {
    'use strict';

    // The installed-app shell: Home, Studies and Settings tabs as a bottom bar (phone) or a labelled
    // rail (tablet and desktop). Home and Settings are panels of the reader page; Studies is a link
    // tab (`data-shell-link`) to the Bible-studies page, which shows the same bar with its own tab current. It only reveals markup already in index.html and toggles classes and
    // attributes on <html>; the rules live in devotional-shell-core.js and the look in shell.css.
    // Nothing is persisted: the app always opens on Home.

    const ANALYTICS_EVENT = 'bottom_bar_action';

    // Controls that live in the header and on the reading page in a browser tab and in Settings in the
    // installed app. The existing elements are moved, never copied or recreated: the scripts that read
    // them by id (language selector, theme toggle, font size radios) keep working untouched.
    const SETTINGS_CONTROLS = [
        { slot: 'language', selector: '#language-selector' },
        { slot: 'theme', selector: '.theme-switch' },
        { slot: 'font', selector: '.text-size-toggle' },
    ];

    function moveControlsToSettings(doc) {
        SETTINGS_CONTROLS.forEach(({ slot, selector }) => {
            const target = doc.querySelector(`[data-shell-slot="${slot}"]`);
            const control = doc.querySelector(selector);
            if (target && control && !target.contains(control)) target.appendChild(control);
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

    // A link tab whose name the config does not list (the remote kill switch) is removed, never shown.
    function pruneLinkTabs(buttons, allowedTabs) {
        buttons.filter((b) => b.hasAttribute('data-shell-link') && !allowedTabs.includes(b.dataset.shellTab)).forEach((b) => b.remove());
        return buttons.filter((b) => b.isConnected !== false);
    }

    // Returns whether the shell was started. A page without the shell markup (an older cached
    // index.html) stays as it is.
    function init(doc, win, config) {
        const core = global.DevotionalShellCore;
        if (!core || !core.isShellSurface(win, config)) return false;
        const nav = doc.querySelector('[data-shell-nav]');
        if (!nav) return false;

        const shell = config.surfaces.shell;
        const root = doc.documentElement;
        const layout = shell.layout || {};
        const allowedTabs = shell.tabs || [];
        const settings = doc.querySelector('[data-shell-settings]');
        const buttons = pruneLinkTabs(Array.from(nav.querySelectorAll('[data-shell-tab]')), allowedTabs);

        // The studies page has no Settings panel: it only shows the bar, with its own tab marked.
        if (!settings) {
            const current = nav.querySelector('[data-shell-current]');
            if (!current) return false;
            current.setAttribute('aria-current', 'page');
            if (layout.contentMaxWidth) root.style.setProperty('--shell-content-max', `${layout.contentMaxWidth}px`);
            applyLayout(root, win, layout);
            root.classList.add('shell-active');
            return true;
        }

        const panelButtons = buttons.filter((b) => !b.hasAttribute('data-shell-link'));
        const panelTabs = allowedTabs.filter((tab) => panelButtons.some((b) => b.dataset.shellTab === tab));
        const state = core.createTabState(panelTabs, core.resolveInitialTab(win.location && win.location.hash, panelTabs));
        if (state.current() === null) return false;

        if (layout.contentMaxWidth) root.style.setProperty('--shell-content-max', `${layout.contentMaxWidth}px`);
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
        }));

        applyLayout(root, win, layout);
        moveControlsToSettings(doc);
        root.classList.add('shell-active');
        return true;
    }

    global.DevotionalShell = { init };
})(window);

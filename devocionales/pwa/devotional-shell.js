(function (global) {
    'use strict';

    // The installed-app shell: Home and Settings tabs as a bottom bar (phone) or a labelled rail
    // (tablet and desktop). It only reveals markup already in index.html and toggles classes and
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

    // Returns whether the shell was started. A page without the shell markup (an older cached
    // index.html) stays as it is.
    function init(doc, win, config) {
        const core = global.DevotionalShellCore;
        if (!core || !core.isShellSurface(win, config)) return false;
        const nav = doc.querySelector('[data-shell-nav]');
        const settings = doc.querySelector('[data-shell-settings]');
        if (!nav || !settings) return false;

        const shell = config.surfaces.shell;
        const buttons = Array.from(nav.querySelectorAll('[data-shell-tab]'));
        const state = core.createTabState((shell.tabs || []).filter((tab) => buttons.some((b) => b.dataset.shellTab === tab)), 'home');
        if (state.current() === null) return false;

        const root = doc.documentElement;
        const layout = shell.layout || {};
        if (layout.contentMaxWidth) root.style.setProperty('--shell-content-max', `${layout.contentMaxWidth}px`);
        const renderTab = () => {
            root.dataset.shellView = state.current();
            buttons.forEach((button) => {
                if (button.dataset.shellTab === state.current()) button.setAttribute('aria-current', 'page');
                else button.removeAttribute('aria-current');
            });
        };
        renderTab();
        buttons.forEach((button) => button.addEventListener('click', () => {
            if (!state.select(button.dataset.shellTab)) return;
            renderTab();
            track(win, state.current());
        }));

        if (layout.railMinWidth && typeof win.matchMedia === 'function') {
            const query = win.matchMedia(`(min-width: ${layout.railMinWidth}px)`);
            const renderLayout = () => { root.dataset.shellLayout = query.matches ? 'rail' : 'bar'; };
            renderLayout();
            if (typeof query.addEventListener === 'function') query.addEventListener('change', renderLayout);
        } else {
            root.dataset.shellLayout = 'bar';
        }
        moveControlsToSettings(doc);
        root.classList.add('shell-active');
        return true;
    }

    global.DevotionalShell = { init };
})(window);

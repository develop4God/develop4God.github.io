(function (global) {
    'use strict';

    // Pure rules of the installed-app shell (no DOM): which surface gets it, which links it may
    // contain, and the tab state. PWA-only code; the DOM wiring is devotional-shell.js.

    const SCOPE_PATH = '/devocionales';

    // The allow-list of the installed app: links stay inside /devocionales/, plus the contact
    // mailto and the external hosts below. It is test-only on purpose: nothing enforces it at
    // runtime, so a link that breaks it shows up as a failing e2e audit
    // (e2e/devocionales-shell.spec.js) instead of being silently neutralised. The audit judges
    // only links a person can reach: the brand link to "/" is made inert by
    // DevotionalStandalone.apply and #back-link is hidden under .is-standalone, so both are out
    // of reach; if either stops being so, the audit fails.
    // External links open in a new tab (the app keeps its own window) and never lead to Google
    // Play: Android has the native app, not this one. Rows for links that are not in the DOM yet
    // (share targets, Bible references) are intentional: they are part of the confirmed allow-list.
    const EXTERNAL_RULES = [
        { hosts: ['www.paypal.com', 'paypal.com'], pathPrefix: '/paypalme/' },
        { hosts: ['wa.me'], pathPrefix: '/' },
        { hosts: ['www.facebook.com', 'facebook.com'], pathPrefix: '/sharer' },
        { hosts: ['x.com', 'twitter.com'], pathPrefix: '/intent/' },
        { hosts: ['t.me'], pathPrefix: '/share' },
        { hosts: ['www.bible.com', 'bible.com', 'www.biblegateway.com', 'biblegateway.com'], pathPrefix: '/' },
    ];

    // The shell exists only in the installed app on iOS and desktop, and only while both kill
    // switches allow it. Like push, an unknown surface (a missing or older standalone module)
    // fails closed: no shell.
    function isShellSurface(win, config) {
        if (!config || config.enabled === false) return false;
        const shell = config.surfaces && config.surfaces.shell;
        if (!shell || shell.enabled !== true) return false;
        const standalone = global.DevotionalStandalone;
        if (!standalone || typeof standalone.isStandalone !== 'function' || typeof standalone.isAndroid !== 'function') return false;
        return standalone.isStandalone(win) && !standalone.isAndroid(win.navigator);
    }

    function isInsideScope(url, origin) {
        return url.origin === origin && (url.pathname === SCOPE_PATH || url.pathname.startsWith(`${SCOPE_PATH}/`));
    }

    function isAllowedExternal(url, link) {
        if (url.protocol !== 'https:' || url.username || url.password) return false;
        if (link.target !== '_blank' || !String(link.rel || '').toLowerCase().split(/\s+/).includes('noopener')) return false;
        return EXTERNAL_RULES.some((rule) => rule.hosts.includes(url.hostname) && url.pathname.startsWith(rule.pathPrefix));
    }

    // `link` is { href, target, rel }; `origin` is the page's own origin; `contactAddress` is the
    // one mailto the app may hold. A link without an href is not navigation.
    function isAllowedLink(link, origin, contactAddress) {
        if (!link.href) return true;
        let url;
        try {
            url = new URL(link.href, `${origin}${SCOPE_PATH}/`);
        } catch (err) {
            return false;
        }
        if (url.protocol === 'mailto:') {
            return Boolean(contactAddress) && decodeURIComponent(url.pathname).toLowerCase() === contactAddress.toLowerCase();
        }
        if (url.origin === origin) return isInsideScope(url, origin);
        return isAllowedExternal(url, link);
    }

    // Which tab is showing. An unknown or repeated selection changes nothing.
    function createTabState(tabs, initial) {
        const list = Array.isArray(tabs) ? [...new Set(tabs)] : [];
        let active = list.includes(initial) ? initial : (list[0] || null);
        return {
            tabs: list,
            current: () => active,
            select(name) {
                if (!list.includes(name) || name === active) return false;
                active = name;
                return true;
            },
        };
    }

    global.DevotionalShellCore = { isShellSurface, isAllowedLink, createTabState };
})(window);

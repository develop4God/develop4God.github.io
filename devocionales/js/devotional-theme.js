(function (global) {
    'use strict';

    // Light/dark theme: one implementation shared by the reader, the legal pages and the
    // Bible-studies page (previously copy-pasted inline into each HTML file). Loaded as a
    // blocking <script> in <head> so the stored theme is applied before first paint (no flash).
    const STORAGE_KEY = 'theme';
    const THEMES = ['light', 'dark'];

    function createTheme({ storage, root, prefersDark }) {
        function stored() {
            try {
                const value = storage.getItem(STORAGE_KEY);
                return THEMES.includes(value) ? value : null;
            } catch (_) {
                return null;
            }
        }

        function init() {
            const saved = stored();
            if (saved) root.setAttribute('data-theme', saved);
        }

        function current() {
            return root.getAttribute('data-theme') || (prefersDark() ? 'dark' : 'light');
        }

        function set(next) {
            if (!THEMES.includes(next)) return;
            root.setAttribute('data-theme', next);
            try { storage.setItem(STORAGE_KEY, next); } catch (_) { /* blocked storage: theme still applies for this visit */ }
        }

        function bindToggle(toggle) {
            if (!toggle) return;
            const iconDark = toggle.parentElement.querySelector('.theme-icon-dark');
            const iconLight = toggle.parentElement.querySelector('.theme-icon-light');
            const sync = () => {
                const isDark = current() === 'dark';
                toggle.checked = isDark;
                iconDark.classList.toggle('is-active', isDark);
                iconLight.classList.toggle('is-active', !isDark);
            };
            toggle.addEventListener('change', () => {
                set(toggle.checked ? 'dark' : 'light');
                sync();
            });
            sync();
        }

        return { init, current, set, bindToggle };
    }

    global.DevotionalTheme = { createTheme };

    if (global.document && global.localStorage) {
        const theme = createTheme({
            storage: global.localStorage,
            root: global.document.documentElement,
            prefersDark: () => global.matchMedia('(prefers-color-scheme: dark)').matches,
        });
        theme.init();
        global.document.addEventListener('DOMContentLoaded', () => theme.bindToggle(global.document.getElementById('theme-toggle')));
    }
})(window);

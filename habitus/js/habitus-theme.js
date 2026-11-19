// Theme switch of the Habitus+Faith pages: syncs the #theme-toggle checkbox and its sun/moon icons with
// data-theme (set early in <head>) and persists the choice under the shared 'theme' key.
(function () {
    const toggle = document.getElementById('theme-toggle');
    const iconDark = toggle.parentElement.querySelector('.theme-icon-dark');
    const iconLight = toggle.parentElement.querySelector('.theme-icon-light');

    function currentTheme() {
        const attr = document.documentElement.getAttribute('data-theme');
        if (attr) return attr;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function syncSwitch() {
        const isDark = currentTheme() === 'dark';
        toggle.checked = isDark;
        iconDark.classList.toggle('is-active', isDark);
        iconLight.classList.toggle('is-active', !isDark);
    }

    toggle.addEventListener('change', () => {
        const next = toggle.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        syncSwitch();
    });

    syncSwitch();
})();

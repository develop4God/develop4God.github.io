(function (global) {
    'use strict';

    // "Install app" button. It is hidden in the HTML and shown only once the browser reports that
    // the page is installable (`beforeinstallprompt`), so it never appears where installing is
    // impossible or after the app is already installed. A tap opens the browser's own prompt.
    function init(doc, win) {
        const button = doc.querySelector('[data-install]');
        if (!button) return;
        let deferred = null;
        const show = () => {
            button.classList.remove('hidden');
            button.classList.add('inline-flex');
        };
        const hide = () => {
            deferred = null;
            button.classList.add('hidden');
            button.classList.remove('inline-flex');
        };
        win.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferred = event;
            show();
        });
        win.addEventListener('appinstalled', hide);
        button.addEventListener('click', async () => {
            const event = deferred;
            if (!event) return;
            hide(); // a prompt event can be used only once, whatever the answer
            try {
                await event.prompt();
                await event.userChoice;
            } catch (err) {
                // The browser refused to show the prompt; the button stays hidden until it offers another.
            }
        });
    }

    global.DevotionalInstall = { init };
})(window);

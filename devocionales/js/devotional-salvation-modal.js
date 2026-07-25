(function (global) {
    'use strict';

    const SALVATION_DONT_SHOW_KEY = 'salvationPrayerDontShow';

    // Salvation prayer modal — shown after the visitor advances to a new
    // devotional (mirrors SalvationPrayerDialog in the Flutter app), unless
    // they've previously checked "don't show again".
    let salvationModalBound = false;

    function showSalvationPrayerModal() {
        if (localStorage.getItem(SALVATION_DONT_SHOW_KEY) === '1') return;

        const modal = document.getElementById('salvation-prayer-modal');
        document.getElementById('salvation-modal-title').textContent = DevotionalI18n.t('devotionals.salvationPrayerTitle', '');
        document.getElementById('salvation-modal-intro').textContent = DevotionalI18n.t('devotionals.salvationPrayerIntro', '');
        document.getElementById('salvation-modal-prayer').textContent = DevotionalI18n.t('devotionals.salvationPrayer', '');
        document.getElementById('salvation-modal-promise').textContent = DevotionalI18n.t('devotionals.salvationPromise', '');
        document.getElementById('salvation-modal-already-prayed').textContent = DevotionalI18n.t('devotionals.salvationAlreadyPrayed', '');
        document.getElementById('salvation-modal-continue').textContent = DevotionalI18n.t('devotionals.salvationContinue', '');
        document.getElementById('salvation-modal-dont-show').checked = false;
        modal.classList.remove('hidden');

        if (salvationModalBound) return;
        salvationModalBound = true;
        document.getElementById('salvation-modal-continue').addEventListener('click', () => {
            const dontShow = document.getElementById('salvation-modal-dont-show').checked;
            if (dontShow) localStorage.setItem(SALVATION_DONT_SHOW_KEY, '1');
            modal.classList.add('hidden');
        });
    }

    global.DevotionalSalvationModal = { showSalvationPrayerModal };
})(window);

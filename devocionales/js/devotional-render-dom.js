(function (global) {
    'use strict';

    function showError(onRetry) {
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('error-state').classList.remove('hidden');
        document.getElementById('error-state').querySelector('p').textContent =
            DevotionalI18n.t('devotionals.errorLoad', '');
        const retryBtn = document.getElementById('error-retry');
        retryBtn.textContent = DevotionalI18n.t('devotionals.errorRetry', '');
        retryBtn.onclick = onRetry;
    }

    function splitVersiculo(raw) {
        // "Libro C:V VERSION: "texto"" -> { ref: "Libro C:V VERSION", texto: "texto" }
        const quoteIdx = raw.indexOf('"');
        if (quoteIdx === -1) return { ref: raw, texto: '' };
        const ref = raw.slice(0, raw.lastIndexOf(':', quoteIdx)).trim();
        const texto = raw.slice(quoteIdx).replace(/^"|"$/g, '');
        return { ref: ref || raw, texto };
    }

    function renderAccordion(paraMeditar) {
        const container = document.getElementById('meditar-accordion');
        container.innerHTML = '';
        (paraMeditar || []).forEach((item) => {
            const wrap = document.createElement('div');
            wrap.className = 'accordion-item open';
            wrap.innerHTML = `
                <button class="accordion-title" type="button" aria-expanded="true">
                    <span>${item.cita}</span>
                    <i data-lucide="chevron-down" class="chev w-4 h-4"></i>
                </button>
                <div class="accordion-content">
                    <div class="accordion-content-inner">${item.texto}</div>
                </div>
            `;
            const title = wrap.querySelector('.accordion-title');
            title.addEventListener('click', () => {
                const isOpen = wrap.classList.toggle('open');
                title.setAttribute('aria-expanded', String(isOpen));
            });
            container.appendChild(wrap);
        });
    }

    function renderTags(tags) {
        const wrap = document.getElementById('tags-wrap');
        const list = document.getElementById('tags-list');
        if (!tags || !tags.length) {
            wrap.classList.add('hidden');
            return;
        }
        list.innerHTML = tags.map(t => `<span class="tag-pill">${t}</span>`).join('');
    }

    // Same stacked-listener pitfall as devotional-tts.js's setupTts:
    // renderShareLinks runs on every entry render (nav/language change), so
    // the native-share click handler is bound once and reads current share
    // data from this module-level variable instead of being re-attached per
    // render.
    let shareData = null;
    let shareHandlerBound = false;

    function renderShareLinks(entry) {
        const url = window.location.href;
        const eyebrow = DevotionalI18n.t('devotionals.eyebrow', '');
        const labels = {
            eyebrow,
            versiculo: DevotionalI18n.t('devotionals.versiculo', ''),
            reflexion: DevotionalI18n.t('devotionals.reflexion', ''),
            oracion: DevotionalI18n.t('devotionals.oracion', ''),
            readMore: DevotionalI18n.t('devotionals.shareReadMore', ''),
            footerTitle: DevotionalI18n.t('devotionals.shareFooterTitle', ''),
            footerCompleteApp: DevotionalI18n.t('devotionals.shareFooterCompleteApp', ''),
            footerDailyDevotionals: DevotionalI18n.t('devotionals.shareFooterDailyDevotionals', ''),
            footerAudioReading: DevotionalI18n.t('devotionals.shareFooterAudioReading', ''),
            footerBibleStudies: DevotionalI18n.t('devotionals.shareFooterBibleStudies', ''),
            footerBibleVersions: DevotionalI18n.t('devotionals.shareFooterBibleVersions', ''),
            footerAndMore: DevotionalI18n.t('devotionals.shareFooterAndMore', ''),
            footerDownload: DevotionalI18n.t('devotionals.shareFooterDownload', ''),
            footerBenefits: DevotionalI18n.t('devotionals.shareFooterBenefits', ''),
            footerDeveloper: DevotionalI18n.t('devotionals.shareFooterDeveloper', ''),
        };
        const shareText = DevotionalShare.buildShareText(entry, labels, url);
        // No separate `url` field here: shareText already embeds the link
        // (via the "read more" line), and some share targets append a
        // provided `url` a second time on top of `text`, duplicating it.
        shareData = { title: eyebrow, text: shareText };

        const nativeBtn = document.getElementById('share-native');
        nativeBtn.setAttribute('aria-label', DevotionalI18n.t('devotionals.shareAria', ''));
        if (!navigator.share) {
            nativeBtn.classList.add('hidden');
            return;
        }

        if (shareHandlerBound) return;
        shareHandlerBound = true;
        nativeBtn.addEventListener('click', () => {
            navigator.share(shareData).catch(() => {});
        });
    }

    function setupFontSizeToggle() {
        const scope = document.getElementById('font-scope');
        document.querySelectorAll('input[name="fontsize"]').forEach(input => {
            input.addEventListener('change', () => {
                scope.classList.remove('size-large', 'size-larger');
                if (input.value) scope.classList.add(input.value);
            });
        });
    }

    function applyAppBannerText(downloadsPlain) {
        const template = DevotionalI18n.t('devotionals.appBannerText', '');
        document.getElementById('app-banner-message').textContent =
            downloadsPlain ? template.replace('{downloads}', downloadsPlain) : template;
    }

    function applyStaticUiText() {
        document.getElementById('back-link').textContent = DevotionalI18n.t('devotionals.backLink', '');
        document.getElementById('eyebrow-label').textContent = DevotionalI18n.t('devotionals.eyebrow', '');
        document.getElementById('download-app-label').textContent = DevotionalI18n.t('devotionals.downloadApp', '');
        document.getElementById('reading-options-label').textContent = DevotionalI18n.t('devotionals.readingOptions', '');
        document.getElementById('para-meditar-label').textContent = DevotionalI18n.t('devotionals.paraMeditar', '');
        document.getElementById('temas-label').textContent = DevotionalI18n.t('devotionals.temas', '');
        document.getElementById('versiculo-label').textContent = DevotionalI18n.t('devotionals.versiculo', '');
        document.getElementById('reflexion-label').textContent = DevotionalI18n.t('devotionals.reflexion', '');
        document.getElementById('oracion-label').textContent = DevotionalI18n.t('devotionals.oracion', '');
        document.getElementById('comparte-label').textContent = DevotionalI18n.t('devotionals.comparte', '');
        document.querySelector('.tts-label').textContent = DevotionalI18n.t('devotionals.listen', '');
        if (global.AppStats) {
            global.AppStats.fetchStats()
                .then((stats) => applyAppBannerText(stats.downloadsPlain))
                .catch(() => applyAppBannerText());
        } else {
            applyAppBannerText();
        }
        document.getElementById('app-banner-cta').textContent = DevotionalI18n.t('devotionals.appBannerCta', '');
        document.getElementById('app-banner-close').setAttribute('aria-label', DevotionalI18n.t('devotionals.appBannerClose', ''));
        if (localStorage.getItem('appBannerDismissed') !== '1') {
            document.getElementById('app-banner').classList.remove('hidden');
        }
        document.getElementById('nav-vision-label').textContent = DevotionalI18n.t('devotionals.navVision', '');
        document.getElementById('nav-devotional-label').textContent = DevotionalI18n.t('devotionals.navDevotional', '');
        document.getElementById('support-ministry-label').textContent = DevotionalI18n.t('devotionals.supportMinistry', '');
        document.getElementById('support-ministry-btn').setAttribute('title', DevotionalI18n.t('devotionals.supportMinistryTitle', ''));
        document.getElementById('footer-tagline').textContent = DevotionalI18n.t('devotionals.footerTagline', '');
        document.getElementById('footer-contact-label').textContent = DevotionalI18n.t('devotionals.contactMailAria', '');
        document.getElementById('version-select').setAttribute('aria-label', DevotionalI18n.t('devotionals.versionSelectAria', ''));
        document.getElementById('version-info-btn').setAttribute('aria-label', DevotionalI18n.t('devotionals.versionInfoAria', ''));
    }

    global.DevotionalRenderDom = {
        showError,
        splitVersiculo,
        renderAccordion,
        renderTags,
        renderShareLinks,
        setupFontSizeToggle,
        applyStaticUiText,
    };
})(window);

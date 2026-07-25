(function (global) {
    'use strict';

    const VERSION_KEY_PREFIX = 'devocionalVersion:';

    // Full display name + legal copyright/attribution text per (language,
    // version) — ported from devocional_nuevo (Flutter app)'s
    // lib/utils/copyright_utils.dart (copyright text) and
    // bible_reader_core/lib/src/bible_version_registry.dart (display names),
    // consolidated into one table and scoped to the 20 codes this repo
    // actually serves (confirmed against Devocionales-json's index.json).
    // Keep in sync with the Dart source if either changes.
    const BIBLE_VERSION_INFO = {
        es: {
            RVR1960: { name: 'Reina Valera 1960', copyright: 'El texto bíblico Reina-Valera 1960® Sociedades Bíblicas en América Latina, 1960. Derechos renovados 1988, Sociedades Bíblicas Unidas.' },
            NVI: { name: 'Nueva Versión Internacional', copyright: 'El texto bíblico Nueva Versión Internacional® © 1999 Biblica, Inc. Todos los derechos reservados.' },
        },
        en: {
            KJV: { name: 'King James Version', copyright: 'The biblical text King James Version® Public Domain.' },
            NIV: { name: 'New International Version', copyright: 'The biblical text New International Version® © 2011 Biblica, Inc. All rights reserved.' },
        },
        pt: {
            ARC: { name: 'Almeida Revista e Corrigida', copyright: 'O texto bíblico Almeida Revista e Corrigida® Domínio Público.' },
            NVI: { name: 'Nova Versão Internacional', copyright: 'O texto bíblico Nova Versão Internacional® © 2000 Biblica, Inc. Todos os direitos reservados.' },
        },
        fr: {
            LSG1910: { name: 'Louis Segond 1910', copyright: 'Le texte biblique Louis Segond 1910® Domaine Public.' },
            TOB: { name: 'Traduction Oecuménique de la Bible', copyright: 'Le texte biblique Traduction Oecuménique de la Bible® © Société Biblique Française et Éditions du Cerf.' },
        },
        ja: {
            '新改訳2003': { name: '新改訳2003', copyright: '聖書本文 新改訳2003聖書® © 2003 新日本聖書刊行会。すべての権利が保護されています。' },
            'リビングバイブル': { name: 'リビングバイブル', copyright: '聖書本文 リビングバイブル® © 1997 新日本聖書刊行会。すべての権利が保護されています。' },
        },
        zh: {
            '和合本1919': { name: '和合本1919', copyright: '圣经和合本版权属于公有领域。' },
            '新译本': { name: '新译本', copyright: '圣经《新译本》版权属于环球圣经公会，蒙允准使用。版权所有，不得翻印。' },
        },
        hi: {
            HIOV: { name: 'पवित्र बाइबिल (ओ.वी.)', copyright: 'पवित्र बाइबिल हिन्दी ओ.वी. संस्करण (HIOV) © Bible Society of India. सभी अधिकार सुरक्षित।' },
            HERV: { name: 'पवित्र बाइबिल (HERV)', copyright: 'पवित्र बाइबिल आसान हिंदी संस्करण (HERV) © 1995, 2010 Bible League International. सभी अधिकार सुरक्षित।' },
        },
        de: {
            LU17: { name: 'Lutherbibel 2017', copyright: 'Lutherbibel, revidiert 2017, © 2016 Deutsche Bibelgesellschaft, Stuttgart.' },
            SCH2000: { name: 'Schlachter 2000', copyright: 'Schlachter 2000 © Genfer Bibelgesellschaft. Alle Rechte vorbehalten.' },
        },
        ar: {
            NAV: { name: 'كتاب الحياة', copyright: 'النص الكتابي الترجمة العربية الجديدة © 2005 Biblica, Inc. جميع الحقوق محفوظة.' },
            SVDA: { name: 'فان دايك', copyright: 'النص الكتابي ترجمة سميث وفاندايك، ملك عام.' },
        },
        fil: {
            MBB05: { name: 'Magandang Balita Biblia', copyright: 'Ang Magandang Balita Biblia (MBB) © 2005, 2012 Philippine Bible Society. Lahat ng karapatan ay nakalaan.' },
            ASND: { name: 'Ang Salita ng Dios', copyright: 'Ang Salita ng Dios (Tagalog Contemporary Bible) © 2009, 2011, 2014, 2015 Biblica, Inc. ® Ginamit sa pahintulot ng Biblica, Inc.® Lahat ng karapatan ay nakalaan sa buong mundo.' },
        },
    };

    function versionInfo(lang, version) {
        return (BIBLE_VERSION_INFO[lang] && BIBLE_VERSION_INFO[lang][version]) || null;
    }

    // Selected Bible version per language, persisted independently per
    // language (a version choice in one language has no meaning in another).
    // Falls back to the caller-supplied default until the visitor picks one,
    // or if the stored code isn't (no longer) a valid option for that language.
    function resolveVersion(lang, defaultVersion) {
        const stored = localStorage.getItem(VERSION_KEY_PREFIX + lang);
        return stored || defaultVersion;
    }

    function setVersion(lang, version) {
        localStorage.setItem(VERSION_KEY_PREFIX + lang, version);
    }

    // Legally-required per-version attribution/copyright notice, always
    // visible (not tap-to-expand) — matches the Flutter app's persistent
    // inline-text pattern (see devocional_nuevo's copyright_utils.dart).
    // Uses entry.version (the version actually loaded for this content),
    // not the caller's current-selection state, so it's never out of sync
    // with what's on screen.
    function renderVersionCopyright(language, entry) {
        const el = document.getElementById('version-copyright');
        const info = versionInfo(language, entry.version);
        if (!info) {
            el.textContent = '';
            return;
        }
        const label = DevotionalI18n.t('devotionals.versionCopyrightLabel', 'Bible version');
        el.textContent = `${label}: ${info.name} (${entry.version}) — ${info.copyright}`;
    }

    // (i) button next to the version dropdown: shows the selected version's
    // full display name (e.g. "NVI" -> "Nueva Versión Internacional") for
    // visitors who don't recognize the acronym. Separate from
    // renderVersionCopyright's persistent legal notice — this is a quick,
    // dismissible lookup, not the compliance-required text.
    let versionInfoHandlerBound = false;

    function updateVersionInfoPopover(language, version) {
        const info = versionInfo(language, version);
        const popover = document.getElementById('version-info-popover');
        popover.textContent = info ? `${info.name} (${version})` : version;

        if (versionInfoHandlerBound) return;
        versionInfoHandlerBound = true;
        const btn = document.getElementById('version-info-btn');
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const isOpen = popover.classList.toggle('hidden') === false;
            btn.setAttribute('aria-expanded', String(isOpen));
        });
        document.addEventListener('click', (ev) => {
            if (!popover.classList.contains('hidden') && !popover.contains(ev.target) && ev.target !== btn) {
                popover.classList.add('hidden');
                btn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Populates the version <select> with whatever index.json publishes for
    // the current language, and re-loads the current date under the newly
    // selected version on change. Rebuilt on every render() (language can
    // change the option list), but the change listener is bound once and
    // reads current language/version via the getters/callbacks passed in —
    // same stacked-listener avoidance as devotional-loader.js's setupTts.
    let versionHandlerBound = false;

    async function setupVersionSelect({ getLanguage, getVersion, setVersion: setVersionState, availableVersions, onVersionChange }) {
        const select = document.getElementById('version-select');
        const versions = await availableVersions(getLanguage());

        select.innerHTML = versions.map((v) => `<option value="${v}">${v}</option>`).join('');
        select.value = getVersion();
        updateVersionInfoPopover(getLanguage(), getVersion());

        if (versionHandlerBound) return;
        versionHandlerBound = true;
        select.addEventListener('change', () => {
            setVersionState(select.value);
            setVersion(getLanguage(), select.value);
            updateVersionInfoPopover(getLanguage(), select.value);
            onVersionChange();
        });
    }

    global.DevotionalVersion = {
        versionInfo,
        resolveVersion,
        setVersion,
        renderVersionCopyright,
        updateVersionInfoPopover,
        setupVersionSelect,
    };
})(window);

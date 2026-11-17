(function (global) {
    'use strict';

    // Copyright line for a study: the text of the study's OWN Bible version (its embedded verse
    // text), falling back to the per-language default exactly like devocional_nuevo's
    // lib/utils/copyright_utils.dart `getCopyrightText`. Known versions come from the reader's
    // existing table (DevotionalVersion.versionInfo, injected); only the per-language defaults
    // below are new. They are transcribed from the Dart source: keep in sync with it.
    const DEFAULT_COPYRIGHT = {
        es: 'El texto bíblico Reina-Valera 1960® Sociedades Bíblicas en América Latina, 1960. Derechos renovados 1988, Sociedades Bíblicas Unidas.',
        en: 'The biblical text King James Version® Public Domain.',
        pt: 'O texto bíblico Almeida Revista e Corrigida® Domínio Público.',
        fr: 'Le texte biblique Louis Segond 1910® Domaine Public.',
        ja: '聖書本文 新改訳聖書® パブリックドメイン。',
        zh: '圣经和合本版权属于公有领域。',
        hi: 'पवित्र बाइबिल हिन्दी ओ.वी. संस्करण (HIOV) © Bible Society of India. सभी अधिकार सुरक्षित।',
        de: 'Lutherbibel, revidiert 2017, © 2016 Deutsche Bibelgesellschaft, Stuttgart.',
        ar: 'النص الكتابي الترجمة العربية الجديدة © 2005 Biblica, Inc. جميع الحقوق محفوظة.',
        fil: 'Ang Magandang Balita Biblia (MBB) © 2005, 2012 Philippine Bible Society. Lahat ng karapatan ay nakalaan.',
    };

    function createCopyright({ versionInfo }) {
        function resolve(lang, version) {
            const known = versionInfo(lang, version);
            if (known && known.copyright) return known.copyright;
            return DEFAULT_COPYRIGHT[lang] || DEFAULT_COPYRIGHT.en;
        }
        return { resolve };
    }

    global.DiscoveryCopyright = { createCopyright, DEFAULT_COPYRIGHT };
})(window);

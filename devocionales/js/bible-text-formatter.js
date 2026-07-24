/**
 * Bible text formatting utilities for TTS.
 *
 * Ported from devocional_nuevo/lib/services/tts/bible_text_formatter.dart —
 * keep both in sync when fixing verse-reading bugs. Covers es/en/pt/fr/de/
 * ja/zh/hi/ar/fil, matching the Dart source's language coverage.
 */
(function (global) {
    'use strict';

    // Ported from devocional_nuevo/lib/services/tts/hindi_tts_normalizer.dart.
    // Owns Hindi-specific TTS pre-processing, applied before any shared
    // normalization steps.
    const HindiTtsNormalizer = (function () {
        const DEVANAGARI_DIGITS = {
            '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
            '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
        };

        function convertDevanagariDigits(text) {
            let result = text;
            Object.keys(DEVANAGARI_DIGITS).forEach((deva) => {
                result = result.split(deva).join(DEVANAGARI_DIGITS[deva]);
            });
            return result;
        }

        function normalizeDanda(text) {
            return text.split('॥').join('. ').split('।').join('. ');
        }

        const EXTRA_VERSION_KEYS = {
            'HIOV_hi.SQLite3': 'पवित्र बाइबिल पुराना संस्करण',
            'HERV_hi.SQLite3': 'पवित्र बाइबिल हिंदी आसान पठन संस्करण',
        };

        function expandVersionAbbreviations(text) {
            let result = text;
            Object.keys(EXTRA_VERSION_KEYS).forEach((key) => {
                result = result.split(key).join(EXTRA_VERSION_KEYS[key]);
            });
            return result;
        }

        function preProcess(text) {
            let result = convertDevanagariDigits(text);
            result = normalizeDanda(result);
            result = expandVersionAbbreviations(result);
            return result;
        }

        return { preProcess };
    })();

    function sanitizeInput(input) {
        if (!input) return input;
        let out = input.replace(/�/g, '');
        out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
        out = out.replace(/[①-⓿]/g, '');
        out = out.replace(/\s+/g, ' ').trim();
        return out;
    }

    const BOOK_ORDINAL_PATTERNS = {
        es: {
            regex: /(?:^|\s)([123])\s+([A-Za-záéíóúÁÉÍÓÚñÑ]+)/gi,
            ordinals: { 1: 'Primera de', 2: 'Segunda de', 3: 'Tercera de' },
        },
        en: {
            regex: /(?:^|\s)([123])\s+([A-Za-z]+)/gi,
            ordinals: { 1: 'First', 2: 'Second', 3: 'Third' },
        },
        pt: {
            regex: /(?:^|\s)([123])\s+([A-Za-záéíóúâêîôûãõç]+)/gi,
            ordinals: { 1: 'Primeiro', 2: 'Segundo', 3: 'Terceiro' },
        },
        fr: {
            regex: /(?:^|\s)([123])\s+([A-Za-zéèêëàâäùûüôîïç]+)/gi,
            ordinals: { 1: 'Premier', 2: 'Deuxième', 3: 'Troisième' },
        },
        de: {
            regex: /(?:^|\s)([123])\s+([A-Za-zäöüßÄÖÜ]+)/gi,
            ordinals: { 1: 'Erster', 2: 'Zweiter', 3: 'Dritter' },
        },
        // Hindi and Arabic use a leading-separator-capture pattern (rather
        // than a prefix-detection one) to match the Dart source's regex
        // shape for these two languages exactly.
        hi: {
            regex: /(^|\s)([123])\s+([ऀ-ॿ]+)/gi,
            ordinals: { 1: 'पहला', 2: 'दूसरा', 3: 'तीसरा' },
            separatorCapture: true,
        },
        ar: {
            regex: /(^|\s)([123])\s+([؀-ۿ]+)/gi,
            ordinals: { 1: 'الأول', 2: 'الثاني', 3: 'الثالث' },
            separatorCapture: true,
        },
        fil: {
            regex: /(?:^|\s)([123])\s+([A-Za-záéíóúñÁÉÍÓÚÑ]+)/gi,
            ordinals: { 1: 'Una', 2: 'Pangalawa', 3: 'Pangatlo' },
        },
    };

    // Japanese and Chinese Bible book names don't use ordinals — the Dart
    // source just trims and returns them unchanged.
    function formatBibleBookCJKNoOrdinal(reference) {
        return reference.trim();
    }

    function formatBibleBook(reference, language) {
        if (language === 'ja' || language === 'zh') {
            return formatBibleBookCJKNoOrdinal(reference);
        }

        const config = BOOK_ORDINAL_PATTERNS[language] || BOOK_ORDINAL_PATTERNS.es;

        if (config.separatorCapture) {
            return reference.replace(config.regex, (match, separator, number, book) => {
                if (!number || !book) return match;
                const ordinal = config.ordinals[number] || '';
                return `${separator}${ordinal} ${book}`;
            });
        }

        return reference.replace(config.regex, (match, number, book) => {
            if (!number || !book) return match;
            const prefix = /^\s/.test(match) ? ' ' : '';
            const ordinal = config.ordinals[number] || '';
            return `${prefix}${ordinal} ${book}`;
        });
    }

    const BIBLE_VERSION_EXPANSIONS = {
        es: {
            RVR1960: 'Reina Valera mil novecientos sesenta',
            NVI: 'Nueva Versión Internacional',
            NTV: 'Nueva Traducción Viviente',
        },
        en: {
            KJV: 'King James Version',
            NIV: 'New International Version',
            ESV: 'English Standard Version',
        },
        pt: {
            ARC: 'Almeida Revista e Corrigida',
            NVI: 'Nova Versão Internacional',
        },
        fr: {
            LSG1910: 'Louis Segond mille neuf cent dix',
            TOB: 'Traduction Oecuménique de la Bible',
        },
        de: {
            LU17: 'Lutherbibel zweitausendsiebzehn',
            SCH2000: 'Schlachter zweitausend',
        },
        ja: {
            '新改訳2003': '新改訳にせんさんねん',
            'リビングバイブル': 'リビングバイブル',
        },
        zh: {
            '和合本1919': '和合本一九一九',
            '新译本': '新译本',
        },
        hi: {
            // Full Devanagari names (from database)
            'पवित्र बाइबिल (ओ.वी.)': 'पवित्र बाइबिल पुराना संस्करण',
            'पवित्र बाइबिल': 'पवित्र बाइबिल हिंदी आसान पठन संस्करण',
            // Abbreviations (for constants usage)
            HIOV: 'पवित्र बाइबिल पुराना संस्करण',
            HERV: 'पवित्र बाइबिल हिंदी आसान पठन संस्करण',
            OV: 'पुराना संस्करण',
        },
        ar: {
            NAV: 'كتاب الحياة',
            SVDA: 'الكتاب المقدس — فان دايك',
        },
        fil: {
            MBB05: 'Magandang Balita Biblia',
            ASND: 'Ang Salita ng Dios',
            ADB: 'Ang Dating Biblia',
        },
    };

    function getBibleVersionExpansions(language) {
        return BIBLE_VERSION_EXPANSIONS[language] || BIBLE_VERSION_EXPANSIONS.es;
    }

    const REFERENCE_WORDS = {
        es: ['capítulo', 'versículo'],
        en: ['chapter', 'verse'],
        pt: ['capítulo', 'versículo'],
        fr: ['chapitre', 'verset'],
        de: ['Kapitel', 'Vers'],
        ja: ['章', '節'],
        zh: ['章', '节'],
        hi: ['अध्याय', 'पद'],
        ar: ['الإصحاح', 'الآية'],
        fil: ['kabanata', 'talata'],
    };

    const TO_WORD = {
        es: 'al', en: 'to', pt: 'ao', fr: 'au', de: 'bis',
        ja: '～', zh: '至', hi: 'से', ar: 'إلى', fil: 'hanggang',
    };

    function formatBibleReferences(text, language) {
        const [chapterWord, verseWord] = REFERENCE_WORDS[language] || REFERENCE_WORDS.es;
        const toWord = TO_WORD[language] || TO_WORD.es;

        const isCJK = language === 'zh' || language === 'ja';
        const isDevanagari = language === 'hi';
        const isArabic = language === 'ar';
        const pattern = isCJK
            ? /((?:\d+\s+)?[一-龯ぁ-んァ-ン]+)\s+(\d+):(\d+)(?:-(\d+))?/gi
            : isDevanagari
                ? /((?:पहला|दूसरा|तीसरा)?\s*[ऀ-ॿ]+)\s+(\d+):(\d+)(?:-(\d+))?/gi
                : isArabic
                    ? /((?:الأول|الثاني|الثالث)?\s*[؀-ۿ]+)\s+(\d+):(\d+)(?:-(\d+))?/gi
                    : /(\b(?:\d+\s+)?[A-Za-záéíóúÁÉÍÓÚñÑäöüßÄÖÜ]+)\s+(\d+):(\d+)(?:-(\d+))?/gi;

        return text.replace(pattern, (match, book, chapter, verseStart, verseEnd) => {
            if (!book || !chapter || !verseStart) return match;
            let result = `${book} ${chapterWord} ${chapter} ${verseWord} ${verseStart}`;
            if (verseEnd) result += ` ${toWord} ${verseEnd}`;
            return result;
        });
    }

    function normalizeTtsText(text, language, version) {
        let normalized = sanitizeInput(text);

        // Hindi-specific pre-processing (SRP: delegated to HindiTtsNormalizer),
        // applied before any shared normalization steps.
        if (language === 'hi') {
            normalized = HindiTtsNormalizer.preProcess(normalized);
        }

        normalized = formatBibleBook(normalized, language);

        const versions = getBibleVersionExpansions(language);
        // Sorted longest-first and stopped after the first match: some
        // languages' keys are substrings of each other (e.g. hi's 'पवित्र
        // बाइबिल' inside 'पवित्र बाइबिल (ओ.वी.)', or 'OV' inside 'HIOV').
        // Matching the longest key first and stopping prevents a shorter
        // key from re-matching text that a longer key's expansion just
        // produced.
        const sortedKeys = Object.keys(versions).sort((a, b) => b.length - a.length);
        for (const key of sortedKeys) {
            if (normalized.includes(key)) {
                normalized = normalized.split(key).join(versions[key]);
                break;
            }
        }

        normalized = formatBibleReferences(normalized, language);
        return normalized.replace(/\s+/g, ' ').trim();
    }

    global.BibleTextFormatter = { normalizeTtsText, formatBibleBook, formatBibleReferences, getBibleVersionExpansions };
})(window);

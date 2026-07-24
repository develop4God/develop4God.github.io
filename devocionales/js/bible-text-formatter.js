/**
 * Bible text formatting utilities for TTS.
 *
 * Ported from devocional_nuevo/lib/services/tts/bible_text_formatter.dart —
 * keep both in sync when fixing verse-reading bugs. Scoped to es/en/pt to
 * match this site's current supported languages (the Dart source also
 * covers fr/de/ja/zh/hi/ar/fil).
 */
(function (global) {
    'use strict';

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
    };

    function formatBibleBook(reference, language) {
        const config = BOOK_ORDINAL_PATTERNS[language] || BOOK_ORDINAL_PATTERNS.es;
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
    };

    function getBibleVersionExpansions(language) {
        return BIBLE_VERSION_EXPANSIONS[language] || BIBLE_VERSION_EXPANSIONS.es;
    }

    const REFERENCE_WORDS = {
        es: ['capítulo', 'versículo'],
        en: ['chapter', 'verse'],
        pt: ['capítulo', 'versículo'],
    };

    const TO_WORD = { es: 'al', en: 'to', pt: 'ao' };

    function formatBibleReferences(text, language) {
        const [chapterWord, verseWord] = REFERENCE_WORDS[language] || REFERENCE_WORDS.es;
        const toWord = TO_WORD[language] || TO_WORD.es;
        const pattern = /(\b(?:\d+\s+)?[A-Za-záéíóúÁÉÍÓÚñÑäöüßÄÖÜ]+)\s+(\d+):(\d+)(?:-(\d+))?/gi;

        return text.replace(pattern, (match, book, chapter, verseStart, verseEnd) => {
            if (!book || !chapter || !verseStart) return match;
            let result = `${book} ${chapterWord} ${chapter} ${verseWord} ${verseStart}`;
            if (verseEnd) result += ` ${toWord} ${verseEnd}`;
            return result;
        });
    }

    function normalizeTtsText(text, language, version) {
        let normalized = sanitizeInput(text);
        normalized = formatBibleBook(normalized, language);

        const versions = getBibleVersionExpansions(language);
        Object.keys(versions).forEach((key) => {
            if (normalized.includes(key)) {
                normalized = normalized.split(key).join(versions[key]);
            }
        });

        normalized = formatBibleReferences(normalized, language);
        return normalized.replace(/\s+/g, ' ').trim();
    }

    global.BibleTextFormatter = { normalizeTtsText, formatBibleBook, formatBibleReferences, getBibleVersionExpansions };
})(window);

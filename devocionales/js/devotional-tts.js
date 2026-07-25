(function (global) {
    'use strict';

    // Builds TTS-ready text from a devotional entry: expands book ordinals,
    // Bible version codes, and "chapter:verse" into spoken-out-loud phrasing
    // (also prevents e.g. "3:16" from being misread as a clock time). Ported
    // from the Flutter app's DevocionalTtsTextBuilder/BibleTextFormatter —
    // see bible-text-formatter.js.
    function buildTtsText(entry, language) {
        const eyebrow = DevotionalI18n.t('devotionals.eyebrow', '');
        const reflexion = DevotionalI18n.t('devotionals.reflexion', '');
        const paraMeditar = DevotionalI18n.t('devotionals.paraMeditar', '');
        const oracion = DevotionalI18n.t('devotionals.oracion', '');
        const norm = (s) => BibleTextFormatter.normalizeTtsText(s || '', language, entry.version);
        const parts = [
            `${eyebrow}: ${norm(entry.versiculo)}`,
            `${reflexion}: ${norm(entry.reflexion)}`,
        ];
        if (entry.para_meditar && entry.para_meditar.length) {
            const meditar = entry.para_meditar
                .map((m) => `${norm(m.cita)}: ${m.texto}`)
                .join('\n');
            parts.push(`${paraMeditar}: ${meditar}`);
        }
        parts.push(`${oracion}: ${norm(entry.oracion)}`);
        return parts.join('\n');
    }

    // The entry/language currently loaded for TTS purposes. setupTts() only
    // ever attaches ONE click listener (guarded below) and reads these on
    // each click, instead of re-attaching a new listener — with a stale
    // closure over the old entry — on every render(). Stacked listeners were
    // triggering speechSynthesis.speak() multiple times per click after
    // navigating a few times, which also broke "stop" (cancel() only
    // silenced one of several overlapping utterances).
    let ttsEntry = null;
    let ttsLanguage = null;
    let ttsHandlerBound = false;

    function setupTts(entry, language, localeTag) {
        ttsEntry = entry;
        ttsLanguage = language;
        const btn = document.getElementById('tts-btn');

        if (!('speechSynthesis' in window)) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            return;
        }

        // Switching devotionals (nav or language change) while speech is
        // active would otherwise keep reading the old entry's text.
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
            btn.classList.remove('speaking');
            btn.querySelector('.tts-label').textContent = DevotionalI18n.t('devotionals.listen', '');
        }

        if (ttsHandlerBound) return;
        ttsHandlerBound = true;

        btn.addEventListener('click', () => {
            const label = btn.querySelector('.tts-label');
            const listen = DevotionalI18n.t('devotionals.listen', '');
            if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
                btn.classList.remove('speaking');
                label.textContent = listen;
                return;
            }

            const utterance = new SpeechSynthesisUtterance(buildTtsText(ttsEntry, ttsLanguage));
            utterance.lang = DevotionalI18n.t('devotionals.ttsLang', localeTag || '');
            utterance.onend = () => {
                btn.classList.remove('speaking');
                label.textContent = listen;
            };
            speechSynthesis.speak(utterance);
            btn.classList.add('speaking');
            label.textContent = DevotionalI18n.t('devotionals.stop', '');
        });
    }

    global.DevotionalTts = { buildTtsText, setupTts };
})(window);

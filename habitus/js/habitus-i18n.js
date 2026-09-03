// Habitus+Faith page i18n. Fetch-based, modeled on work-with-me/js/work-with-me-i18n.js
// (itself modeled on js/home.js): fetches /lang/habitus/{locale}.json, applies
// data-i18n text, handles meta.title/meta.description, builds a language-switcher
// dropdown reusing the same 10-language metadata as home.js, and persists the
// chosen language to the shared cross-section localStorage key.
(function () {
  'use strict';

  const DEFAULT_LANGUAGE = 'en';
  const SUPPORTED_LANGUAGES = ['es', 'en', 'pt', 'fr', 'zh', 'ja', 'hi', 'de', 'ar', 'fil'];
  const STORAGE_KEY = 'develop4God_language';

  let currentLanguage = DEFAULT_LANGUAGE;
  let translations = {};

  function getBrowserLanguage() {
    const lang = navigator.language || navigator.userLanguage;
    const shortLang = lang.split('-')[0].toLowerCase();
    return SUPPORTED_LANGUAGES.includes(shortLang) ? shortLang : DEFAULT_LANGUAGE;
  }

  function loadSavedLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
      return saved;
    }
    return getBrowserLanguage();
  }

  function saveLanguage(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
  }

  async function fetchTranslations(lang) {
    try {
      const response = await fetch(`/lang/habitus/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load translations for ${lang}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error loading translations:', error);
      if (lang !== DEFAULT_LANGUAGE) {
        return fetchTranslations(DEFAULT_LANGUAGE);
      }
      return {};
    }
  }

  // Get nested translation value — pure, testable.
  function getNestedTranslation(obj, key) {
    const keys = key.split('.');
    let value = obj;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return null;
      }
    }
    return value;
  }

  function applyTranslations() {
    if (translations.meta) {
      document.title = translations.meta.title || document.title;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && translations.meta.description) {
        metaDesc.setAttribute('content', translations.meta.description);
      }
    }

    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n');
      const value = getNestedTranslation(translations, key);
      if (value) {
        element.textContent = value;
      }
    });

    // The footer's shared copyright/made-with lines are DOM-inserted by
    // SiteFooter (not static elements with data-i18n), so re-render them
    // here with the live-fetched translations every time translations change.
    if (translations.footer && window.SiteFooter) {
      window.SiteFooter.renderSharedLines(document.getElementById('page-footer'), {
        copyright: translations.footer.copyright,
        madeWith: translations.footer.madeWith
      });
    }
  }

  // Language metadata — same set as js/home.js's LANGUAGE_INFO, reused here
  // so the dropdown shows identical names/flags across sections.
  const LANGUAGE_INFO = {
    es: { name: 'Español', flag: '🇪🇸' },
    en: { name: 'English', flag: '🇺🇸' },
    pt: { name: 'Português', flag: '🇧🇷' },
    fr: { name: 'Français', flag: '🇫🇷' },
    zh: { name: '中文', flag: '🇨🇳' },
    ja: { name: '日本語', flag: '🇯🇵' },
    hi: { name: 'हिन्दी', flag: '🇮🇳' },
    de: { name: 'Deutsch', flag: '🇩🇪' },
    ar: { name: 'العربية', flag: '🇸🇦' },
    fil: { name: 'Filipino', flag: '🇵🇭' }
  };

  function createLanguageSelector() {
    const wrapper = document.getElementById('language-selector');
    if (!wrapper) return;

    const current = LANGUAGE_INFO[currentLanguage] || LANGUAGE_INFO[DEFAULT_LANGUAGE];

    wrapper.innerHTML = `
      <div class="custom-language-selector relative">
        <button
          type="button"
          class="language-selector-button bg-purple-700 hover:bg-purple-600 text-white border border-purple-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-white transition-all duration-200 flex items-center gap-2 min-w-32 interactive"
          aria-haspopup="listbox"
          aria-expanded="false"
        >
          <span class="language-current flex items-center gap-2">
            <span class="text-base">${current.flag}</span>
            <span class="font-medium">${current.name}</span>
          </span>
          <svg class="language-arrow w-4 h-4 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>

        <div class="language-dropdown absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 opacity-0 invisible transform scale-95 transition-all duration-200 overflow-hidden">
          <ul class="language-options" role="listbox">
            ${SUPPORTED_LANGUAGES.map((code) => {
              const info = LANGUAGE_INFO[code];
              const isCurrent = code === currentLanguage;
              return `
                <li>
                  <button
                    type="button"
                    class="language-option w-full px-4 py-3 text-left hover:bg-purple-50 flex items-center gap-3 transition-colors duration-150 ${isCurrent ? 'bg-purple-100 text-purple-700' : 'text-gray-700'}"
                    data-lang="${code}"
                    role="option"
                    ${isCurrent ? 'aria-selected="true"' : 'aria-selected="false"'}
                  >
                    <span class="text-lg">${info.flag}</span>
                    <span class="font-medium">${info.name}</span>
                    ${isCurrent ? '<span class="ml-auto text-purple-600">✓</span>' : ''}
                  </button>
                </li>
              `;
            }).join('')}
          </ul>
        </div>
      </div>
    `;

    setupLanguageSelectorEvents(wrapper);
  }

  function setupLanguageSelectorEvents(container) {
    const button = container.querySelector('.language-selector-button');
    const dropdown = container.querySelector('.language-dropdown');
    const arrow = container.querySelector('.language-arrow');
    const options = container.querySelectorAll('.language-option');

    function openDropdown() {
      button.setAttribute('aria-expanded', 'true');
      dropdown.classList.remove('opacity-0', 'invisible', 'scale-95');
      dropdown.classList.add('opacity-100', 'visible', 'scale-100');
      arrow.classList.add('rotate-180');
    }

    function closeDropdown() {
      button.setAttribute('aria-expanded', 'false');
      dropdown.classList.add('opacity-0', 'invisible', 'scale-95');
      dropdown.classList.remove('opacity-100', 'visible', 'scale-100');
      arrow.classList.remove('rotate-180');
    }

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    options.forEach((option) => {
      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        const lang = option.getAttribute('data-lang');
        closeDropdown();
        await changeLanguage(lang);
      });
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        closeDropdown();
      }
    });

    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        button.click();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown();
        options[0]?.focus();
      }
    });

    options.forEach((option, index) => {
      option.addEventListener('keydown', (e) => {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            options[(index + 1) % options.length]?.focus();
            break;
          case 'ArrowUp':
            e.preventDefault();
            options[(index - 1 + options.length) % options.length]?.focus();
            break;
          case 'Enter':
          case ' ':
            e.preventDefault();
            option.click();
            break;
          case 'Escape':
            closeDropdown();
            button.focus();
            break;
        }
      });
    });
  }

  async function changeLanguage(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      lang = DEFAULT_LANGUAGE;
    }

    currentLanguage = lang;
    saveLanguage(lang);
    translations = await fetchTranslations(lang);
    applyTranslations();
    createLanguageSelector();

    window.RtlHelper.applyDirection(lang);
  }

  async function init() {
    currentLanguage = loadSavedLanguage();
    window.RtlHelper.applyDirection(currentLanguage);

    translations = await fetchTranslations(currentLanguage);
    applyTranslations();
    createLanguageSelector();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.HabitusI18n = {
    getNestedTranslation,
    // Test seam: applies a given translations object to the DOM the same
    // way the live fetch-driven flow does, without touching module state.
    applyTranslationsForTest: (t) => {
      const previous = translations;
      translations = t;
      applyTranslations();
      translations = previous;
    }
  };
})();

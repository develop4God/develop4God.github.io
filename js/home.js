// Home Hub JavaScript - Internationalization
(function() {
  'use strict';

  const DEFAULT_LANGUAGE = 'es';
  const SUPPORTED_LANGUAGES = ['es', 'en', 'pt', 'fr', 'zh'];
  const STORAGE_KEY = 'develop4God_language';

  let currentLanguage = DEFAULT_LANGUAGE;
  let translations = {};

  // Get browser language
  function getBrowserLanguage() {
    const lang = navigator.language || navigator.userLanguage;
    const shortLang = lang.split('-')[0].toLowerCase();
    return SUPPORTED_LANGUAGES.includes(shortLang) ? shortLang : DEFAULT_LANGUAGE;
  }

  // Load language from localStorage or browser
  function loadSavedLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
      return saved;
    }
    return getBrowserLanguage();
  }

  // Save language to localStorage
  function saveLanguage(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
  }

  // Fetch translations
  async function fetchTranslations(lang) {
    try {
      const response = await fetch(`/lang/home/${lang}.json`);
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

  // Apply translations to the page
  function applyTranslations() {
    // Update meta tags
    if (translations.meta) {
      document.title = translations.meta.title || document.title;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && translations.meta.description) {
        metaDesc.setAttribute('content', translations.meta.description);
      }
    }

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const value = getNestedTranslation(key);
      if (value) {
        element.textContent = value;
      }
    });

    // Update all elements with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      const value = getNestedTranslation(key);
      if (value) {
        element.setAttribute('placeholder', value);
      }
    });

    // Update project features
    updateProjectFeatures();
  }

  // Get nested translation value
  function getNestedTranslation(key) {
    const keys = key.split('.');
    let value = translations;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return null;
      }
    }
    return value;
  }

  // Update project features lists
  function updateProjectFeatures() {
    const devoFeatures = document.getElementById('devocionales-features');
    const habitusFeatures = document.getElementById('habitus-features');

    if (devoFeatures && translations.projects?.devocionales?.features) {
      devoFeatures.innerHTML = translations.projects.devocionales.features
        .map(feature => `<li>${feature}</li>`)
        .join('');
    }

    if (habitusFeatures && translations.projects?.habitus?.features) {
      habitusFeatures.innerHTML = translations.projects.habitus.features
        .map(feature => `<li>${feature}</li>`)
        .join('');
    }
  }

  // Create language selector
  function createLanguageSelector() {
    const wrapper = document.getElementById('language-selector');
    if (!wrapper) return;

    const select = document.createElement('select');
    select.id = 'language-select';
    select.className = 'language-select';
    select.setAttribute('aria-label', 'Select language');

    const languages = {
      es: 'Español',
      en: 'English',
      pt: 'Português',
      fr: 'Français',
      zh: '中文'
    };

    Object.entries(languages).forEach(([code, name]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = name;
      if (code === currentLanguage) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener('change', async (e) => {
      const newLang = e.target.value;
      await changeLanguage(newLang);
    });

    wrapper.appendChild(select);
  }

  // Change language
  async function changeLanguage(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      lang = DEFAULT_LANGUAGE;
    }

    currentLanguage = lang;
    saveLanguage(lang);
    translations = await fetchTranslations(lang);
    applyTranslations();

    // Update HTML lang attribute
    document.documentElement.setAttribute('lang', lang);
  }

  // Initialize
  async function init() {
    currentLanguage = loadSavedLanguage();
    document.documentElement.setAttribute('lang', currentLanguage);
    
    translations = await fetchTranslations(currentLanguage);
    applyTranslations();
    createLanguageSelector();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/**
 * Simplified Internationalization system for Devocionales Cristianos website
 */

class I18n {
    constructor() {
        this.currentLang = 'en'; // Default language
        this.translations = {};
        this.supportedLanguages = {
            'es': { name: 'Español', flag: '🇪🇸' },
            'en': { name: 'English', flag: '🇺🇸' },
            'fr': { name: 'Français', flag: '🇫🇷' },
            'pt': { name: 'Português', flag: '🇧🇷' },
            'hi': { name: 'हिन्दी', flag: '🇮🇳' },
            'ja': { name: '日本語', flag: '🇯🇵' },
            'zh': { name: '中文', flag: '🇨🇳' },
            'de': { name: 'Deutsch', flag: '🇩🇪' },
            'ar': { name: 'العربية', flag: '🇸🇦' },
            'fil': { name: 'Filipino', flag: '🇵🇭' }
        };
    }

    async init() {
        // Detect user's preferred language
        this.detectLanguage();

        // Load page-specific translations (e.g., devocionales/legal) and fallback to ES
        await this.loadExternalPageTranslationsIfAvailable();

        // Apply translations to the page
        this.translatePage();

        // Setup language selector
        this.setupLanguageSelector();

        // Update HTML lang attribute
        document.documentElement.lang = this.currentLang;
    }

    // Deep merge helper (source overwrites target values)
    deepMerge(target, source) {
        if (!source || typeof source !== 'object') return target;
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key] || typeof target[key] !== 'object') target[key] = {};
                this.deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    // Merge only missing keys from source into target
    deepMergeMissing(target, source) {
        if (!source || typeof source !== 'object') return target;
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key] || typeof target[key] !== 'object') target[key] = {};
                this.deepMergeMissing(target[key], source[key]);
            } else if (typeof target[key] === 'undefined') {
                target[key] = source[key];
            }
        }
        return target;
    }

    async loadExternalPageTranslationsIfAvailable() {
        try {
            // Only attempt for the Devocionales section where legal JSON lives
            const isDevocionalesPage = window.location.pathname.includes('/devocionales/');
            if (!isDevocionalesPage) return;

            const lang = this.currentLang;
            const basePath = '/devocionales/lang';

            // Load current language file if present
            let current = null;
            try {
                const res = await fetch(`${basePath}/${lang}.json`, { cache: 'no-store' });
                if (res.ok) current = await res.json();
            } catch (e) { /* ignore */ }

            // Load English fallback
            let en = null;
            try {
                const resEn = await fetch(`${basePath}/en.json`, { cache: 'no-store' });
                if (resEn.ok) en = await resEn.json();
            } catch (e) { /* ignore */ }

            if (current) this.deepMerge(this.translations, current);
            if (lang !== 'en' && en) this.deepMergeMissing(this.translations, en);
        } catch (e) {
            console.warn('External page translations not available:', e);
        }
    }

    detectLanguage() {
        try {
            // First check URL parameter
            const urlParams = new URLSearchParams(window.location.search);
            const urlLang = urlParams.get('lang');
            if (urlLang && this.supportedLanguages[urlLang]) {
                this.currentLang = urlLang;
                return;
            }

            // Try to get saved preference (fallback to memory if localStorage fails)
            try {
                const savedLang = localStorage.getItem('develop4God_language');
                if (savedLang && this.supportedLanguages[savedLang]) {
                    this.currentLang = savedLang;
                    return;
                }
            } catch (e) {
                console.warn('localStorage not available, using fallback');
            }

            // Fallback to browser language
            const browserLang = this.detectBrowserLanguage();
            if (browserLang) {
                this.currentLang = browserLang;
            }
        } catch (error) {
            console.warn('Language detection failed, using default:', error);
        }
    }

    detectBrowserLanguage() {
        const browserLang = navigator.language || navigator.languages[0];
        const lang = browserLang.split('-')[0].toLowerCase();
        return this.supportedLanguages[lang] ? lang : null;
    }

    t(key, params = {}) {
        let translation = key.split('.').reduce((obj, key) => obj?.[key], this.translations);
        
        if (!translation) {
            console.warn(`Translation missing for key: ${key}`);
            return key;
        }

        // Simple parameter substitution
        return translation.replace(/\{(\w+)\}/g, (match, param) => params[param] || match);
    }

    translatePage() {
        // Translate elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);
            
            if (element.tagName === 'INPUT' && (element.type === 'button' || element.type === 'submit')) {
                element.value = translation;
            } else if (element.tagName === 'INPUT' && element.placeholder !== undefined) {
                element.placeholder = translation;
            } else {
                element.innerHTML = translation;
            }
        });

        // Translate meta tags
        this.translateMetaTags();

        // Render dynamic legal content if placeholders exist
        this.renderLegalPages();
    }

    translateMetaTags() {
        // Update title
        const titleKey = document.querySelector('meta[name="title-key"]')?.content;
        if (titleKey) {
            document.title = this.t(titleKey);
        }

        // Update description
        const descKey = document.querySelector('meta[name="description-key"]')?.content;
        if (descKey) {
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
                metaDesc.content = this.t(descKey);
            }
        }
    }

    // Dynamic rendering for legal pages from translations JSON
    renderLegalPages() {
        this.renderLegalTerms();
        this.renderLegalPrivacy();
    }

    renderLegalTerms() {
        const container = document.getElementById('legal-terms-content');
        const metaContainer = document.getElementById('legal-terms-meta');
        const terms = this.translations?.legal?.terms;
        if (metaContainer) {
            if (terms?.lastUpdated && terms?.date) {
                metaContainer.innerHTML = `<strong>${terms.lastUpdated}</strong> <span>${terms.date}</span>`;
            } else {
                metaContainer.innerHTML = '';
            }
        }
        if (!container) return;
        if (!terms) {
            container.innerHTML = '<div style="color:red;font-weight:bold">[Error] No se encontró contenido de términos y condiciones para este idioma.</div>';
            return;
        }

        const parts = [];

        // Welcome text at the top (dynamic)
        if (terms.welcome) parts.push(`<p>${terms.welcome}</p>`);

        // Section 1
        if (terms.section1_title) parts.push(`<h2>${terms.section1_title}</h2>`);
        if (terms.section1_text) parts.push(`<p>${terms.section1_text}</p>`);

        // Section 2
        if (terms.section2_title) parts.push(`<h2>${terms.section2_title}</h2>`);
        if (terms.section2_1_title) parts.push(`<h3>${terms.section2_1_title}</h3>`);
        if (terms.section2_1_text) parts.push(`<p>${terms.section2_1_text}</p>`);
        if (terms.section2_2_title) parts.push(`<h3>${terms.section2_2_title}</h3>`);
        if (terms.section2_2_text) parts.push(`<p>${terms.section2_2_text}</p>`);

        // Section 3 with list
        if (terms.section3_title) parts.push(`<h2>${terms.section3_title}</h2>`);
        if (terms.section3_text) parts.push(`<p>${terms.section3_text}</p>`);
        const list3 = [];
        for (let i = 1; i <= 10; i++) {
            const item = terms[`section3_list${i}`];
            if (item) list3.push(`<li>${item}</li>`);
        }
        if (list3.length) parts.push(`<ul>${list3.join('')}</ul>`);

        // Section 4..10 simple title + text pairs
        for (let s = 4; s <= 10; s++) {
            const title = terms[`section${s}_title`];
            const text = terms[`section${s}_text`];
            const sub1Title = terms[`section${s}_1_title`];
            const sub1Text = terms[`section${s}_1_text`];
            const sub2Title = terms[`section${s}_2_title`];
            const sub2Text = terms[`section${s}_2_text`];
            if (title) parts.push(`<h2>${title}</h2>`);
            if (text) parts.push(`<p>${text}</p>`);
            if (sub1Title) parts.push(`<h3>${sub1Title}</h3>`);
            if (sub1Text) parts.push(`<p>${sub1Text}</p>`);
            if (sub2Title) parts.push(`<h3>${sub2Title}</h3>`);
            if (sub2Text) parts.push(`<p>${sub2Text}</p>`);
        }

        // Validation: if only 1 or 2 parts, probably missing content
        if (parts.length <= 2) {
            container.innerHTML = '<div style="color:red;font-weight:bold">[Error] El archivo de idioma no contiene todas las secciones de los términos y condiciones.<br>Revisa que el archivo JSON tenga todas las claves necesarias.</div>' + parts.join('\n');
        } else {
            container.innerHTML = parts.join('\n');
        }
    }

    renderLegalPrivacy() {
        const container = document.getElementById('legal-privacy-content');
        const privacy = this.translations?.legal?.privacy;
        if (!container) return;
        if (!privacy) {
            container.innerHTML = '<div style="color:red;font-weight:bold">[Error] No se encontró contenido de política de privacidad para este idioma.</div>';
            return;
        }

        const parts = [];

        // Section 1 with nested list items
        if (privacy.section1_title) parts.push(`<h2>${privacy.section1_title}</h2>`);
        if (privacy.section1_text) parts.push(`<p>${privacy.section1_text}</p>`);
        const s1Groups = [1,2,3,4,5,6];
        const s1List = [];
        s1Groups.forEach(n => {
            const title = privacy[`section1_list${n}_title`];
            const text = privacy[`section1_list${n}_text`];
            const purpose = privacy[`section1_list${n}_purpose`];
            const purposeText = privacy[`section1_list${n}_purpose_text`];
            if (title || text) {
                let li = '<li>';
                if (title) li += `<strong>${title}</strong> `;
                if (text) li += `${text}`;
                const sub = [];
                if (purpose) sub.push(`<strong>${purpose}</strong> ${purposeText || ''}`);
                if (sub.length) li += `<ul><li>${sub.join('')}</li></ul>`;
                li += '</li>';
                s1List.push(li);
            }
        });
        if (s1List.length) parts.push(`<ul>${s1List.join('')}</ul>`);

        if (privacy.important_note_title || privacy.important_note_text) {
            parts.push(`<p><strong>${privacy.important_note_title || ''}</strong> ${privacy.important_note_text || ''}</p>`);
        }

        // Sections 2..7 simple title + text and optional lists
        for (let s = 2; s <= 7; s++) {
            const title = privacy[`section${s}_title`];
            const text = privacy[`section${s}_text`];
            if (title) parts.push(`<h2>${title}</h2>`);
            if (text) parts.push(`<p>${text}</p>`);
            // Generic list items like section4_list1..n
            const listItems = [];
            for (let i = 1; i <= 20; i++) {
                const item = privacy[`section${s}_list${i}`];
                if (item) listItems.push(`<li>${item}</li>`);
            }
            if (listItems.length) parts.push(`<ul>${listItems.join('')}</ul>`);
        }

        // Validación: si solo hay 1 o 2 partes, probablemente solo está la descripción
        if (parts.length <= 2) {
            container.innerHTML = '<div style="color:red;font-weight:bold">[Error] El archivo de idioma no contiene todas las secciones de la política de privacidad.<br>Revisa que el archivo JSON tenga todas las claves necesarias.</div>' + parts.join('\n');
        } else {
            container.innerHTML = parts.join('\n');
        }
    }

    setupLanguageSelector() {
        // Find existing language selector or create one
        let selector = document.getElementById('language-selector');
        if (!selector) {
            selector = this.createLanguageSelector();
        }
        
        // Replace existing content with custom dropdown
        this.renderCustomLanguageSelector(selector);
    }

    renderCustomLanguageSelector(container) {
        const currentLang = this.supportedLanguages[this.currentLang];
        
        container.innerHTML = `
            <div class="custom-language-selector relative">
                <button 
                    type="button" 
                    class="language-selector-button bg-purple-700 hover:bg-purple-600 text-white border border-purple-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-white transition-all duration-200 flex items-center gap-2 min-w-32 interactive"
                    aria-haspopup="listbox"
                    aria-expanded="false"
                >
                    <span class="language-current flex items-center gap-2">
                        <span class="text-base">${currentLang.flag}</span>
                        <span class="font-medium">${currentLang.name}</span>
                    </span>
                    <svg class="language-arrow w-4 h-4 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </button>
                
                <div class="language-dropdown absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 opacity-0 invisible transform scale-95 transition-all duration-200 overflow-hidden">
                    <ul class="language-options" role="listbox">
                        ${Object.entries(this.supportedLanguages).map(([code, info]) => `
                            <li>
                                <button 
                                    type="button" 
                                    class="language-option w-full px-4 py-3 text-left hover:bg-purple-50 flex items-center gap-3 transition-colors duration-150 ${code === this.currentLang ? 'bg-purple-100 text-purple-700' : 'text-gray-700'}"
                                    data-lang="${code}"
                                    role="option"
                                    ${code === this.currentLang ? 'aria-selected="true"' : 'aria-selected="false"'}
                                >
                                    <span class="text-lg">${info.flag}</span>
                                    <span class="font-medium">${info.name}</span>
                                    ${code === this.currentLang ? '<span class="ml-auto text-purple-600">✓</span>' : ''}
                                </button>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `;

        // Setup event listeners
        this.setupLanguageSelectorEvents(container);
    }

    setupLanguageSelectorEvents(container) {
        const button = container.querySelector('.language-selector-button');
        const dropdown = container.querySelector('.language-dropdown');
        const arrow = container.querySelector('.language-arrow');
        const options = container.querySelectorAll('.language-option');

        // Toggle dropdown
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = button.getAttribute('aria-expanded') === 'true';
            
            if (isExpanded) {
                this.closeLanguageDropdown(button, dropdown, arrow);
            } else {
                this.openLanguageDropdown(button, dropdown, arrow);
            }
        });

        // Handle option selection
        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const lang = option.getAttribute('data-lang');
                this.changeLanguage(lang);
                this.closeLanguageDropdown(button, dropdown, arrow);
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                this.closeLanguageDropdown(button, dropdown, arrow);
            }
        });

        // Keyboard navigation
        button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                button.click();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.openLanguageDropdown(button, dropdown, arrow);
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
                        this.closeLanguageDropdown(button, dropdown, arrow);
                        button.focus();
                        break;
                }
            });
        });
    }

    openLanguageDropdown(button, dropdown, arrow) {
        button.setAttribute('aria-expanded', 'true');
        dropdown.classList.remove('opacity-0', 'invisible', 'scale-95');
        dropdown.classList.add('opacity-100', 'visible', 'scale-100');
        arrow.classList.add('rotate-180');
    }

    closeLanguageDropdown(button, dropdown, arrow) {
        button.setAttribute('aria-expanded', 'false');
        dropdown.classList.add('opacity-0', 'invisible', 'scale-95');
        dropdown.classList.remove('opacity-100', 'visible', 'scale-100');
        arrow.classList.remove('rotate-180');
    }

    createLanguageSelector() {
        const selector = document.createElement('div');
        selector.id = 'language-selector';
        selector.className = 'language-selector';

        // Try to insert in navigation
        const nav = document.querySelector('nav ul');
        if (nav) {
            const li = document.createElement('li');
            li.appendChild(selector);
            nav.appendChild(li);
        }

        return selector;
    }

    async changeLanguage(lang) {
        if (!this.supportedLanguages[lang] || lang === this.currentLang) return;

        // If on a legal page, force a full reload with the new lang param to ensure all content is refreshed
        const isLegalPage = window.location.pathname.includes('terminos-y-condiciones') || window.location.pathname.includes('politica-de-privacidad');
        if (isLegalPage) {
            const url = new URL(window.location);
            url.searchParams.set('lang', lang);
            window.location.href = url.toString();
            return;
        }

        this.currentLang = lang;

        // Save preference (fallback to memory if localStorage fails)
        try {
            localStorage.setItem('develop4God_language', lang);
        } catch (e) {
            console.warn('Could not save language preference to localStorage');
        }

        // Limpiar traducciones antes de cargar
        this.translations = {};
        // Cargar traducciones externas y luego traducir la página
        await this.loadExternalPageTranslationsIfAvailable();
        this.translatePage();

        // Update HTML lang attribute
        document.documentElement.lang = lang;

        // Update URL if needed (for SEO)
        if (history.replaceState) {
            const url = new URL(window.location);
            url.searchParams.set('lang', lang);
            history.replaceState(null, '', url);
        }

        // Re-render the selector with new language
        const selector = document.getElementById('language-selector');
        if (selector) {
            this.renderCustomLanguageSelector(selector);
        }

        // Re-initialize Lucide icons after content change
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            setTimeout(() => lucide.createIcons(), 100);
        }

        // Dispatch custom event for other components that might need to update
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    }

    // Utility method to get current language
    getCurrentLanguage() {
        return this.currentLang;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.i18n = new I18n();
    window.i18n.init().catch(console.error);
});

// Smooth scroll enhancement for navigation links
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});
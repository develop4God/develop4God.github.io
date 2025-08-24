/**
 * Internationalization system for Devocionales Cristianos website
 */

class I18n {
    constructor() {
        this.currentLang = 'es'; // Default language
        this.translations = {};
        this.supportedLanguages = {
            'es': { name: 'Español', flag: '🇪🇸' },
            'en': { name: 'English', flag: '🇺🇸' },
            'fr': { name: 'Français', flag: '🇫🇷' },
            'pt': { name: 'Português', flag: '🇧🇷' }
        };
    }

    async init() {
        // Detect user's preferred language
        await this.detectLanguage();
        
        // Load translations
        await this.loadTranslations(this.currentLang);
        
        // Apply translations to the page
        this.translatePage();
        
        // Setup language selector
        this.setupLanguageSelector();
        
        // Update HTML lang attribute
        document.documentElement.lang = this.currentLang;
    }

    async detectLanguage() {
        try {
            // First check if user has a saved preference
            const savedLang = localStorage.getItem('preferred-language');
            if (savedLang && this.supportedLanguages[savedLang]) {
                this.currentLang = savedLang;
                return;
            }

            // Try to detect location-based language
            const locationLang = await this.detectLocationLanguage();
            if (locationLang) {
                this.currentLang = locationLang;
                return;
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

    async detectLocationLanguage() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }

            const timeout = setTimeout(() => resolve(null), 5000);

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    clearTimeout(timeout);
                    try {
                        // Use a simple geolocation to language mapping
                        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}&localityLanguage=en`);
                        const data = await response.json();
                        
                        const countryCode = data.countryCode?.toLowerCase();
                        const langMap = {
                            'es': 'es', 'mx': 'es', 'ar': 'es', 'co': 'es', 've': 'es', 'pe': 'es', 'cl': 'es',
                            'us': 'en', 'gb': 'en', 'ca': 'en', 'au': 'en', 'nz': 'en', 'ie': 'en',
                            'fr': 'fr', 'be': 'fr', 'ch': 'fr', 'lu': 'fr', 'mc': 'fr',
                            'br': 'pt', 'pt': 'pt', 'ao': 'pt', 'mz': 'pt'
                        };

                        resolve(langMap[countryCode] || null);
                    } catch (error) {
                        console.warn('Geolocation language detection failed:', error);
                        resolve(null);
                    }
                },
                (error) => {
                    clearTimeout(timeout);
                    console.warn('Geolocation access denied or failed:', error);
                    resolve(null);
                }
            );
        });
    }

    detectBrowserLanguage() {
        const browserLang = navigator.language || navigator.languages[0];
        const lang = browserLang.split('-')[0].toLowerCase();
        return this.supportedLanguages[lang] ? lang : null;
    }

    async loadTranslations(lang) {
        try {
            const response = await fetch(`/lang/${lang}.json`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.translations = await response.json();
        } catch (error) {
            console.warn(`Failed to load translations for ${lang}:`, error);
            if (lang !== 'es') {
                // Fallback to Spanish
                await this.loadTranslations('es');
            }
        }
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

    setupLanguageSelector() {
        // Create language selector if it doesn't exist
        let selector = document.getElementById('language-selector');
        if (!selector) {
            selector = this.createLanguageSelector();
        }
        
        // Add language options
        const select = selector.querySelector('select') || selector;
        if (select.tagName === 'SELECT') {
            select.innerHTML = '';
            Object.entries(this.supportedLanguages).forEach(([code, info]) => {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = `${info.flag} ${info.name}`;
                option.selected = code === this.currentLang;
                select.appendChild(option);
            });

            select.addEventListener('change', (e) => this.changeLanguage(e.target.value));
        }
    }

    createLanguageSelector() {
        const selector = document.createElement('div');
        selector.id = 'language-selector';
        selector.className = 'relative inline-block';
        selector.innerHTML = `
            <select class="bg-transparent text-white border border-purple-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-white transition-colors">
            </select>
        `;

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

        this.currentLang = lang;
        localStorage.setItem('preferred-language', lang);
        
        await this.loadTranslations(lang);
        this.translatePage();
        
        // Update HTML lang attribute
        document.documentElement.lang = lang;
        
        // Update URL if needed (for SEO)
        if (history.replaceState) {
            const url = new URL(window.location);
            url.searchParams.set('lang', lang);
            history.replaceState(null, '', url);
        }
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
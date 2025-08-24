/**
 * Content Management System for Devocionales Cristianos
 */

class ContentManager {
    constructor() {
        this.currentLanguage = 'es';
        this.currentElement = null;
        this.translations = {};
        this.init();
    }

    async init() {
        await this.loadTranslations();
        this.setupDragAndDrop();
        this.setupEventListeners();
        this.setupEditing();
    }

    async loadTranslations() {
        const languages = ['es', 'en', 'fr', 'pt'];
        for (const lang of languages) {
            try {
                const response = await fetch(`/lang/${lang}.json`);
                if (response.ok) {
                    this.translations[lang] = await response.json();
                }
            } catch (error) {
                console.warn(`Failed to load ${lang} translations:`, error);
            }
        }
    }

    setupDragAndDrop() {
        // Make elements draggable
        document.querySelectorAll('.draggable').forEach(element => {
            element.addEventListener('dragstart', this.handleDragStart.bind(this));
            element.addEventListener('dragend', this.handleDragEnd.bind(this));
        });

        // Setup drop zones
        document.querySelectorAll('.drop-zone').forEach(zone => {
            zone.addEventListener('dragover', this.handleDragOver.bind(this));
            zone.addEventListener('drop', this.handleDrop.bind(this));
            zone.addEventListener('dragenter', this.handleDragEnter.bind(this));
            zone.addEventListener('dragleave', this.handleDragLeave.bind(this));
        });

        // Make existing sections sortable
        this.setupSortable();
    }

    setupSortable() {
        const pageContent = document.getElementById('page-content');
        
        // Simple sortable implementation
        let draggedElement = null;

        pageContent.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('section-editor')) {
                draggedElement = e.target;
                e.target.style.opacity = '0.5';
            }
        });

        pageContent.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('section-editor')) {
                e.target.style.opacity = '';
                draggedElement = null;
            }
        });

        pageContent.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        pageContent.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedElement && e.target !== draggedElement) {
                const rect = e.target.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                
                if (e.clientY < midY) {
                    pageContent.insertBefore(draggedElement, e.target);
                } else {
                    pageContent.insertBefore(draggedElement, e.target.nextSibling);
                }
            }
        });
    }

    handleDragStart(e) {
        e.target.classList.add('dragging');
        e.dataTransfer.setData('text/plain', e.target.dataset.element);
    }

    handleDragEnd(e) {
        e.target.classList.remove('dragging');
    }

    handleDragOver(e) {
        e.preventDefault();
    }

    handleDragEnter(e) {
        e.target.classList.add('active');
    }

    handleDragLeave(e) {
        e.target.classList.remove('active');
    }

    handleDrop(e) {
        e.preventDefault();
        e.target.classList.remove('active');
        
        const elementType = e.dataTransfer.getData('text/plain');
        const newElement = this.createElement(elementType);
        
        if (newElement) {
            e.target.parentNode.replaceChild(newElement, e.target);
        }
    }

    createElement(type) {
        const templates = {
            hero: `
                <div class="section-editor relative p-4 bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg" data-section="hero" draggable="true">
                    <div class="editor-tools hidden">
                        <button class="edit-btn bg-blue-500 text-white p-2 rounded mr-2 hover:bg-blue-600">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-btn bg-red-500 text-white p-2 rounded hover:bg-red-600">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <h3 class="text-lg font-bold text-purple-800 mb-2">New Hero Section</h3>
                    <div class="editable p-2 border rounded" data-key="new.hero.title">
                        <h1 class="text-2xl font-bold">New Hero Title</h1>
                    </div>
                    <div class="editable p-2 border rounded mt-2" data-key="new.hero.subtitle">
                        <p class="text-lg">Hero Subtitle</p>
                    </div>
                </div>
            `,
            feature: `
                <div class="section-editor relative p-4 bg-blue-50 rounded-lg" data-section="feature" draggable="true">
                    <div class="editor-tools hidden">
                        <button class="edit-btn bg-blue-500 text-white p-2 rounded mr-2 hover:bg-blue-600">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-btn bg-red-500 text-white p-2 rounded hover:bg-red-600">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <h3 class="text-lg font-bold text-blue-800 mb-2">Feature Card</h3>
                    <div class="editable p-2 border rounded" data-key="new.feature.title">Feature Title</div>
                    <div class="editable p-2 border rounded mt-2" data-key="new.feature.description">Feature description...</div>
                </div>
            `,
            text: `
                <div class="section-editor relative p-4 bg-green-50 rounded-lg" data-section="text" draggable="true">
                    <div class="editor-tools hidden">
                        <button class="edit-btn bg-blue-500 text-white p-2 rounded mr-2 hover:bg-blue-600">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-btn bg-red-500 text-white p-2 rounded hover:bg-red-600">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <h3 class="text-lg font-bold text-green-800 mb-2">Text Block</h3>
                    <div class="editable p-2 border rounded" data-key="new.text.content">
                        <p>Your text content goes here...</p>
                    </div>
                </div>
            `,
            image: `
                <div class="section-editor relative p-4 bg-yellow-50 rounded-lg" data-section="image" draggable="true">
                    <div class="editor-tools hidden">
                        <button class="edit-btn bg-blue-500 text-white p-2 rounded mr-2 hover:bg-blue-600">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-btn bg-red-500 text-white p-2 rounded hover:bg-red-600">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <h3 class="text-lg font-bold text-yellow-800 mb-2">Image Block</h3>
                    <div class="editable p-2 border rounded" data-key="new.image.alt">
                        <div class="bg-gray-200 p-8 text-center rounded">
                            <i class="fas fa-image text-4xl text-gray-400"></i>
                            <p class="mt-2 text-gray-600">Image placeholder</p>
                        </div>
                    </div>
                </div>
            `,
            contact: `
                <div class="section-editor relative p-4 bg-red-50 rounded-lg" data-section="contact" draggable="true">
                    <div class="editor-tools hidden">
                        <button class="edit-btn bg-blue-500 text-white p-2 rounded mr-2 hover:bg-blue-600">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-btn bg-red-500 text-white p-2 rounded hover:bg-red-600">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <h3 class="text-lg font-bold text-red-800 mb-2">Contact Section</h3>
                    <div class="editable p-2 border rounded" data-key="new.contact.title">Contact Us</div>
                    <div class="editable p-2 border rounded mt-2" data-key="new.contact.description">Get in touch...</div>
                </div>
            `,
            testimonial: `
                <div class="section-editor relative p-4 bg-indigo-50 rounded-lg" data-section="testimonial" draggable="true">
                    <div class="editor-tools hidden">
                        <button class="edit-btn bg-blue-500 text-white p-2 rounded mr-2 hover:bg-blue-600">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-btn bg-red-500 text-white p-2 rounded hover:bg-red-600">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <h3 class="text-lg font-bold text-indigo-800 mb-2">Testimonial</h3>
                    <div class="editable p-2 border rounded" data-key="new.testimonial.quote">"Amazing app!"</div>
                    <div class="editable p-2 border rounded mt-2" data-key="new.testimonial.author">- Happy User</div>
                </div>
            `
        };

        if (templates[type]) {
            const div = document.createElement('div');
            div.innerHTML = templates[type];
            const element = div.firstElementChild;
            this.setupElementEvents(element);
            return element;
        }
        return null;
    }

    setupElementEvents(element) {
        // Setup hover effects
        element.addEventListener('mouseenter', () => {
            element.querySelector('.editor-tools').classList.remove('hidden');
        });

        element.addEventListener('mouseleave', () => {
            element.querySelector('.editor-tools').classList.add('hidden');
        });

        // Setup edit button
        const editBtn = element.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editElement(element);
            });
        }

        // Setup delete button
        const deleteBtn = element.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteElement(element);
            });
        }

        // Setup editable fields
        element.querySelectorAll('.editable').forEach(editable => {
            editable.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editContent(editable);
            });
        });
    }

    setupEventListeners() {
        // Save changes
        document.getElementById('save-changes').addEventListener('click', this.saveChanges.bind(this));

        // Preview
        document.getElementById('preview').addEventListener('click', this.preview.bind(this));

        // Language selector
        document.getElementById('edit-language').addEventListener('change', this.changeEditLanguage.bind(this));

        // Translation tool
        document.getElementById('translate-btn').addEventListener('click', this.translateText.bind(this));

        // Setup existing elements
        document.querySelectorAll('.section-editor').forEach(element => {
            this.setupElementEvents(element);
        });
    }

    setupEditing() {
        // Edit modal events
        document.getElementById('cancel-edit').addEventListener('click', () => {
            document.getElementById('edit-modal').classList.add('hidden');
        });

        document.getElementById('save-edit').addEventListener('click', () => {
            this.saveEditContent();
        });
    }

    editElement(element) {
        this.currentElement = element;
        this.showPropertyEditor(element);
    }

    editContent(editable) {
        this.currentEditable = editable;
        const modal = document.getElementById('edit-modal');
        const textarea = document.getElementById('edit-content');
        
        textarea.value = editable.textContent.trim();
        modal.classList.remove('hidden');
        textarea.focus();
    }

    saveEditContent() {
        if (this.currentEditable) {
            const newContent = document.getElementById('edit-content').value;
            this.currentEditable.innerHTML = newContent;
            document.getElementById('edit-modal').classList.add('hidden');
            this.currentEditable = null;
        }
    }

    deleteElement(element) {
        if (confirm('Are you sure you want to delete this element?')) {
            // Replace with drop zone
            const dropZone = document.createElement('div');
            dropZone.className = 'drop-zone p-8 rounded-lg text-center text-gray-500';
            dropZone.innerHTML = `
                <i class="fas fa-plus-circle text-3xl mb-2"></i>
                <p>Drag content elements here</p>
            `;
            
            // Add drop zone events
            dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
            dropZone.addEventListener('drop', this.handleDrop.bind(this));
            dropZone.addEventListener('dragenter', this.handleDragEnter.bind(this));
            dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
            
            element.parentNode.replaceChild(dropZone, element);
        }
    }

    showPropertyEditor(element) {
        const propertyEditor = document.getElementById('property-editor');
        const sectionType = element.dataset.section;
        
        let html = `
            <h3 class="font-semibold text-lg mb-3">Edit ${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)}</h3>
            <div class="space-y-3">
        `;

        // Add property fields based on element type
        element.querySelectorAll('.editable').forEach((editable, index) => {
            const key = editable.dataset.key || `${sectionType}_${index}`;
            html += `
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">${key}</label>
                    <textarea class="w-full p-2 border rounded-lg text-sm" rows="2" data-key="${key}">${editable.textContent.trim()}</textarea>
                </div>
            `;
        });

        html += `
            </div>
            <button class="w-full mt-4 bg-purple-500 hover:bg-purple-600 text-white p-2 rounded-lg" onclick="contentManager.updateElement()">
                <i class="fas fa-save mr-2"></i>Update
            </button>
        `;

        propertyEditor.innerHTML = html;
    }

    updateElement() {
        if (!this.currentElement) return;

        const propertyEditor = document.getElementById('property-editor');
        const textareas = propertyEditor.querySelectorAll('textarea');

        textareas.forEach(textarea => {
            const key = textarea.dataset.key;
            const editableElement = this.currentElement.querySelector(`[data-key="${key}"]`);
            if (editableElement) {
                editableElement.innerHTML = textarea.value;
            }
        });

        this.showSuccessMessage('Element updated successfully!');
    }

    changeEditLanguage(e) {
        this.currentLanguage = e.target.value;
        // Update interface based on selected language
        this.updateTranslationInterface();
    }

    updateTranslationInterface() {
        // Update editable elements with translations for current language
        const translations = this.translations[this.currentLanguage];
        if (!translations) return;

        document.querySelectorAll('.editable[data-key]').forEach(element => {
            const key = element.dataset.key;
            const translation = this.getTranslation(translations, key);
            if (translation) {
                element.innerHTML = translation;
            }
        });
    }

    getTranslation(translations, key) {
        return key.split('.').reduce((obj, k) => obj && obj[k], translations);
    }

    async translateText() {
        const text = document.getElementById('translate-text').value;
        const targetLang = document.getElementById('translate-to').value;
        
        if (!text.trim()) return;

        // Simple mock translation (in real app, would use Google Translate API)
        const translations = {
            'en': {
                'Hola': 'Hello',
                'Gracias': 'Thank you',
                'Bienvenido': 'Welcome'
            },
            'fr': {
                'Hello': 'Bonjour',
                'Thank you': 'Merci',
                'Welcome': 'Bienvenue'
            },
            'pt': {
                'Hello': 'Olá',
                'Thank you': 'Obrigado',
                'Welcome': 'Bem-vindo'
            }
        };

        const result = translations[targetLang]?.[text] || `[Translation needed for: "${text}" to ${targetLang}]`;
        
        document.getElementById('translation-result').innerHTML = result;
        document.getElementById('translation-result').classList.remove('hidden');
    }

    saveChanges() {
        // Collect all content changes
        const changes = {};
        
        document.querySelectorAll('.editable[data-key]').forEach(element => {
            const key = element.dataset.key;
            changes[key] = element.innerHTML;
        });

        // Save to localStorage (in real app, would save to backend)
        localStorage.setItem('content_changes', JSON.stringify(changes));
        
        this.showSuccessMessage('Changes saved successfully!');
    }

    preview() {
        // Open preview in new tab
        window.open('index.html', '_blank');
    }

    showSuccessMessage(message) {
        // Create temporary success message
        const alertDiv = document.createElement('div');
        alertDiv.className = 'fixed top-4 right-4 bg-green-500 text-white p-4 rounded-lg shadow-lg z-50';
        alertDiv.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-check-circle mr-2"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
            alertDiv.remove();
        }, 3000);
    }
}

// Initialize content manager when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    window.contentManager = new ContentManager();
});
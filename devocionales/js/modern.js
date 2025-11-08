/**
 * Modern enhancements and interactions for Devocionales Cristianos website
 */

class ModernEnhancements {
    constructor() {
        this.init();
    }

    init() {
        this.setupScrollReveal();
        this.setupParallaxEffect();
        this.setupSmoothScrolling();
        this.setupLoadingAnimations();
        this.setupInteractiveElements();
        this.setupAccessibilityFeatures();
    }

    setupScrollReveal() {
        // Create intersection observer for scroll animations
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                }
            });
        }, observerOptions);

        // Add scroll reveal to elements
        document.addEventListener('DOMContentLoaded', () => {
            const revealElements = document.querySelectorAll('.scroll-reveal, section, .card-hover');
            revealElements.forEach(el => {
                el.classList.add('scroll-reveal');
                observer.observe(el);
            });
        });
    }

    setupParallaxEffect() {
        let ticking = false;
        
        const updateParallax = () => {
            const scrolled = window.pageYOffset;
            const parallaxElements = document.querySelectorAll('.parallax');
            
            parallaxElements.forEach(element => {
                const speed = element.dataset.speed || 0.5;
                const yPos = -(scrolled * speed);
                element.style.transform = `translate3d(0, ${yPos}px, 0)`;
            });
            
            ticking = false;
        };

        const requestTick = () => {
            if (!ticking) {
                requestAnimationFrame(updateParallax);
                ticking = true;
            }
        };

        window.addEventListener('scroll', requestTick);
    }

    setupSmoothScrolling() {
        // Enhanced smooth scrolling for anchor links
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    e.preventDefault();
                    const target = document.querySelector(this.getAttribute('href'));
                    
                    if (target) {
                        const headerOffset = 80;
                        const elementPosition = target.getBoundingClientRect().top;
                        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                        window.scrollTo({
                            top: offsetPosition,
                            behavior: 'smooth'
                        });
                    }
                });
            });
        });
    }

    setupLoadingAnimations() {
        // Add loading states for dynamic content
        const showLoading = (element) => {
            element.innerHTML = '<span class="loading-dots">Loading</span>';
        };

        const hideLoading = (element, content) => {
            element.innerHTML = content;
        };

        // Export for use with language switching
        window.modernEnhancements = {
            showLoading,
            hideLoading
        };
    }

    setupInteractiveElements() {
        document.addEventListener('DOMContentLoaded', () => {
            // Add ripple effect to interactive elements
            document.querySelectorAll('.interactive').forEach(element => {
                element.addEventListener('click', function(e) {
                    const ripple = document.createElement('span');
                    const rect = this.getBoundingClientRect();
                    const size = Math.max(rect.width, rect.height);
                    const x = e.clientX - rect.left - size / 2;
                    const y = e.clientY - rect.top - size / 2;
                    
                    ripple.style.width = ripple.style.height = size + 'px';
                    ripple.style.left = x + 'px';
                    ripple.style.top = y + 'px';
                    ripple.classList.add('ripple');
                    
                    this.appendChild(ripple);
                    
                    setTimeout(() => {
                        ripple.remove();
                    }, 600);
                });
            });

            // Add hover effects to cards
            document.querySelectorAll('.card-hover').forEach(card => {
                card.addEventListener('mouseenter', function() {
                    this.style.transform = 'translateY(-10px) scale(1.02)';
                });
                
                card.addEventListener('mouseleave', function() {
                    this.style.transform = 'translateY(0) scale(1)';
                });
            });
        });
    }

    setupAccessibilityFeatures() {
        document.addEventListener('DOMContentLoaded', () => {
            // Add skip to main content link
            const skipLink = document.createElement('a');
            skipLink.href = '#main';
            skipLink.className = 'skip-to-main';
            skipLink.textContent = 'Skip to main content';
            document.body.insertBefore(skipLink, document.body.firstChild);

            // Improve focus management
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    document.body.classList.add('keyboard-navigation');
                }
            });

            document.addEventListener('mousedown', () => {
                document.body.classList.remove('keyboard-navigation');
            });

            // High contrast mode detection
            if (window.matchMedia('(prefers-contrast: high)').matches) {
                document.body.classList.add('high-contrast');
            }

            // Reduced motion detection
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                document.body.classList.add('reduced-motion');
                // Disable animations
                const style = document.createElement('style');
                style.textContent = `
                    *, ::before, ::after {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.01ms !important;
                    }
                `;
                document.head.appendChild(style);
            }
        });
    }

    // Utility method for adding modern animations to new elements
    static animateIn(element, delay = 0) {
        setTimeout(() => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(30px)';
            element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            
            requestAnimationFrame(() => {
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            });
        }, delay);
    }

    // Method to add pulse animation to important elements
    static addPulseAnimation(element) {
        element.classList.add('pulse-animation');
    }

    // Method to create floating animation
    static addFloatAnimation(element) {
        element.classList.add('float-animation');
    }
}

// Initialize modern enhancements
document.addEventListener('DOMContentLoaded', () => {
    new ModernEnhancements();
});

// Performance optimization: Debounce scroll events
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Add some CSS for ripple effect
const rippleCSS = `
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple-animation 0.6s linear;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    .keyboard-navigation *:focus {
        outline: 2px solid #667eea !important;
        outline-offset: 2px !important;
    }
    
    .high-contrast * {
        filter: contrast(150%);
    }
`;

// Inject ripple CSS
if (!document.querySelector('#ripple-styles')) {
    const style = document.createElement('style');
    style.id = 'ripple-styles';
    style.textContent = rippleCSS;
    document.head.appendChild(style);
}

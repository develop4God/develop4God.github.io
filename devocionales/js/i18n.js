/**
 * Simplified Internationalization system for Devocionales Cristianos website
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
        
        // All translations embedded directly
        this.allTranslations = {
            es: {
                "meta": {
                    "title": "Inicio - Devocionales Cristianos",
                    "description": "Ven y descansa. Encuentra tu refugio diario en la Palabra de Dios con devocionales, audio y contenido espiritual que nutre tu alma en medio del afán del mundo."
                },
                "header": {
                    "title": "Devocionales Cristianos",
                    "mainTitle": "Ven y Descansa",
                    "subtitle": "Encuentra tu Refugio Diario en la Palabra de Dios",
                    "description": "En medio del afán del mundo, busca primero Su reino. Dedica unos minutos cada día a nutrir tu espíritu con devocionales, audio y la paz que solo Él puede dar.",
                    "downloadApp": "Descarga App",
                    "learnMore": "Descubre las Características"
                },
                "navigation": {
                    "home": "Inicio",
                    "vision": "Nuestra Visión",
                    "features": "Características",
                    "dailyProvision": "Provisión Diaria",
                    "contact": "Contacto",
                    "donation": "Donación",
                    "deleteData": "Eliminar Datos"
                },
                "vision": {
                    "title": "Nuestra Visión en Devocionales Cristianos",
                    "description": "Devocionales Cristianos es tu santuario digital, diseñado para ser ese \"lugar apartado\" donde puedes encontrarte con Dios cada día. Como Jesús se retiraba a orar, creemos que necesitas un espacio libre de distracciones donde Su paz pueda restaurar tu alma. Nuestra misión es ser tu compañero fiel en este tiempo sagrado, completamente gratuito y sin interrupciones."
                },
                "dailyProvision": {
                    "title": "Como el Maná de Cada Día",
                    "description": "Así como Dios proveyó maná fresco cada mañana en el desierto, tu app te ofrece alimento espiritual diario. Las rachas no son una presión, son una celebración de la fidelidad de Dios proveyendo para ti día tras día. Cada devocional leído, cada momento de quietud, es un paso más en tu caminar con Él.",
                    "streaks": {
                        "title": "Rachas de Gracia",
                        "description": "Mantén una conexión diaria con Dios. Cada día consecutivo es una celebración de Su fidelidad y tu búsqueda de Él."
                    },
                    "achievements": {
                        "title": "Logros Espirituales",
                        "description": "Celebra tu crecimiento en la fe. Cada devocional leído es un tesoro eterno guardado en tu corazón."
                    }
                },
                "features": {
                    "title": "Tu Refugio Espiritual Completo",
                    "content": { "title": "Contenido Espiritual" },
                    "personal": { "title": "Experiencia Personal" },
                    "freedom": { "title": "Libertad Total" },
                    "audioDevotionals": {
                        "title": "Devocionales con Audio",
                        "description": "Escucha la Palabra mientras descansas. Audio profesional para devocionales completos y versículos, completamente offline."
                    },
                    "versions": {
                        "title": "8 Versiones Bíblicas",
                        "description": "Español: RVR1960, NVI • English: KJV, NIV • Português: ARC, NVI • Français: LSG1910, TOB"
                    },
                    "prayers": {
                        "title": "Centro de Oración",
                        "description": "Un espacio dedicado para elevar tus peticiones y encontrar oraciones que fortalezcan tu comunión con Dios."
                    },
                    "favorites": {
                        "title": "Marca tus Favoritos",
                        "description": "Guarda aquellos devocionales que más tocaron tu corazón para revisitarlos cuando necesites esa palabra específica."
                    },
                    "sharing": {
                        "title": "Comparte la Bendición",
                        "description": "Difunde la esperanza compartiendo devocionales como texto elegante o bellas imágenes inspiradoras."
                    },
                    "themes": {
                        "title": "Personaliza tu Espacio",
                        "description": "Elige entre temas claros y oscuros, creando el ambiente perfecto para tu tiempo de quietud con Dios."
                    },
                    "offline": {
                        "title": "Completamente Offline",
                        "description": "No dependas de conexión a internet. Tu tiempo con Dios está siempre disponible, sin interrupciones ni dependencias."
                    },
                    "noAds": {
                        "title": "Santuario Sin Distracciones",
                        "description": "Cero anuncios. Cero interrupciones. Tu espacio sagrado protegido para que nada perturbe tu comunión con Él."
                    },
                    "languages": {
                        "title": "4 Idiomas Disponibles",
                        "description": "Español, English, Português, Français. La Palabra de Dios en tu idioma del corazón, con contenido adaptado culturalmente."
                    }
                },
                "contact": {
                    "title": "¿Preguntas? ¡Estamos Aquí!",
                    "description": "Si tienes alguna duda, sugerencia, testimonio o simplemente quieres compartir cómo Dios te ha hablado través de la app, nos encantaría escucharte.",
                    "emailButton": "Envíanos un Email",
                    "supportText": "Tu apoyo nos permite seguir siendo completamente gratuitos.",
                    "donationText": "Considera hacer una ofrenda de amor."
                },
                "footer": {
                    "copyright": "© 2025 Devocionales Cristianos. Todos los derechos reservados.",
                    "madeWith": "Desarrollado con ♥️ por develop4God",
                    "terms": "Términos y Condiciones",
                    "privacy": "Política de Privacidad",
                    "deleteData": "Solicitar Eliminación de Datos",
                    "contact": "Contacto"
                },
                "legal": {
                    "privacy": {
                        "title": "Política de Privacidad - Devocionales Cristianos",
                        "lastUpdated": "Fecha de Última Actualización:",
                        "backToHome": "Volver a la página principal",
                        "description": "Esta Política de Privacidad describe cómo la aplicación móvil \"Devocionales Cristianos\" (en adelante, \"la Aplicación\"), propiedad y operada por **Develop4God**, maneja la información del usuario. La privacidad de nuestros usuarios es de suma importancia para nosotros."
                    },
                    "terms": {
                        "title": "Términos y Condiciones - Devocionales Cristianos",
                        "lastUpdated": "Fecha de Última Actualización:",
                        "backToHome": "Volver a la página principal",
                        "welcome": "Bienvenido/a a la aplicación móvil \"Devocionales Cristianos\" (en adelante, \"la Aplicación\"), propiedad y operada por **Develop4God**. Al acceder o utilizar la Aplicación, usted (\"el Usuario\") acepta estar legalmente vinculado/a por los presentes Términos y Condiciones de Uso (en adelante, \"los Términos\"). Si no está de acuerdo con alguno de estos Términos, no debe utilizar la Aplicación."
                    }
                }
            },
            en: {
                "meta": {
                    "title": "Home - Christian Devotionals",
                    "description": "Come and rest. Find your daily refuge in God's Word with devotionals, audio, and spiritual content that nourishes your soul amid the world's busyness."
                },
                "header": {
                    "title": "Christian Devotionals",
                    "mainTitle": "Come and Rest",
                    "subtitle": "Find Your Daily Refuge in God's Word",
                    "description": "In the midst of the world's busyness, seek first His kingdom. Dedicate a few minutes each day to nourish your spirit with devotionals, audio, and the peace that only He can give.",
                    "downloadApp": "Download App",
                    "learnMore": "Discover the Features"
                },
                "navigation": {
                    "home": "Home",
                    "vision": "Our Vision",
                    "features": "Features",
                    "dailyProvision": "Daily Provision",
                    "contact": "Contact",
                    "donation": "Donation",
                    "deleteData": "Delete Data"
                },
                "vision": {
                    "title": "Our Vision at Christian Devotionals",
                    "description": "Christian Devotionals is your digital sanctuary, designed to be that \"quiet place\" where you can meet with God each day. As Jesus withdrew to pray, we believe you need a distraction-free space where His peace can restore your soul. Our mission is to be your faithful companion in this sacred time, completely free and without interruptions."
                },
                "dailyProvision": {
                    "title": "Like Manna Each Day",
                    "description": "Just as God provided fresh manna every morning in the desert, your app offers daily spiritual nourishment. Streaks aren't pressure, they're a celebration of God's faithfulness providing for you day after day. Every devotional read, every moment of stillness, is another step in your walk with Him.",
                    "streaks": {
                        "title": "Streaks of Grace",
                        "description": "Maintain a daily connection with God. Each consecutive day is a celebration of His faithfulness and your seeking Him."
                    },
                    "achievements": {
                        "title": "Spiritual Achievements",
                        "description": "Celebrate your growth in faith. Every devotional read is an eternal treasure stored in your heart."
                    }
                },
                "features": {
                    "title": "Your Complete Spiritual Refuge",
                    "content": { "title": "Spiritual Content" },
                    "personal": { "title": "Personal Experience" },
                    "freedom": { "title": "Total Freedom" },
                    "audioDevotionals": {
                        "title": "Audio Devotionals",
                        "description": "Listen to the Word while you rest. Professional audio for complete devotionals and verses, completely offline."
                    },
                    "versions": {
                        "title": "8 Bible Versions",
                        "description": "Spanish: RVR1960, NVI • English: KJV, NIV • Portuguese: ARC, NVI • French: LSG1910, TOB"
                    },
                    "prayers": {
                        "title": "Prayer Center",
                        "description": "A dedicated space to lift up your requests and find prayers that strengthen your communion with God."
                    },
                    "favorites": {
                        "title": "Mark Your Favorites",
                        "description": "Save those devotionals that most touched your heart to revisit when you need that specific word."
                    },
                    "sharing": {
                        "title": "Share the Blessing",
                        "description": "Spread hope by sharing devotionals as elegant text or beautiful inspirational images."
                    },
                    "themes": {
                        "title": "Customize Your Space",
                        "description": "Choose between light and dark themes, creating the perfect environment for your quiet time with God."
                    },
                    "offline": {
                        "title": "Completely Offline",
                        "description": "Don't depend on internet connection. Your time with God is always available, without interruptions or dependencies."
                    },
                    "noAds": {
                        "title": "Distraction-Free Sanctuary",
                        "description": "Zero ads. Zero interruptions. Your sacred space protected so nothing disturbs your communion with Him."
                    },
                    "languages": {
                        "title": "4 Languages Available",
                        "description": "Spanish, English, Portuguese, French. God's Word in your heart language, with culturally adapted content."
                    }
                },
                "contact": {
                    "title": "Questions? We're Here!",
                    "description": "If you have any questions, suggestions, testimonies, or simply want to share how God has spoken to you through the app, we'd love to hear from you.",
                    "emailButton": "Send us an Email",
                    "supportText": "Your support allows us to remain completely free.",
                    "donationText": "Consider making a love offering."
                },
                "footer": {
                    "copyright": "© 2025 Christian Devotionals. All rights reserved.",
                    "madeWith": "Developed with ♥️ by develop4God",
                    "terms": "Terms and Conditions",
                    "privacy": "Privacy Policy",
                    "deleteData": "Request Data Deletion",
                    "contact": "Contact"
                },
                "legal": {
                    "privacy": {
                        "title": "Privacy Policy - Christian Devotionals",
                        "lastUpdated": "Last Updated:",
                        "backToHome": "Back to main page",
                        "description": "This Privacy Policy describes how the mobile application \"Christian Devotionals\" (hereinafter, \"the Application\"), owned and operated by **Develop4God**, handles user information. The privacy of our users is of utmost importance to us."
                    },
                    "terms": {
                        "title": "Terms and Conditions - Christian Devotionals",
                        "lastUpdated": "Last Updated:",
                        "backToHome": "Back to main page",
                        "welcome": "Welcome to the mobile application \"Christian Devotionals\" (hereinafter, \"the Application\"), owned and operated by **Develop4God**. By accessing or using the Application, you (\"the User\") agree to be legally bound by these Terms and Conditions of Use (hereinafter, \"the Terms\"). If you do not agree with any of these Terms, you should not use the Application."
                    }
                }
            },
            fr: {
                "meta": {
                    "title": "Accueil - Dévotions Chrétiennes",
                    "description": "Venez et reposez-vous. Trouvez votre refuge quotidien dans la Parole de Dieu avec des dévotions, de l'audio et du contenu spirituel qui nourrit votre âme au milieu de l'agitation du monde."
                },
                "header": {
                    "title": "Dévotions Chrétiennes",
                    "mainTitle": "Venez et Reposez-vous",
                    "subtitle": "Trouvez Votre Refuge Quotidien dans la Parole de Dieu",
                    "description": "Au milieu de l'agitation du monde, cherchez d'abord Son royaume. Consacrez quelques minutes chaque jour à nourrir votre esprit avec des dévotions, de l'audio et la paix que Lui seul peut donner.",
                    "downloadApp": "Télécharger l'App",
                    "learnMore": "Découvrir les Fonctionnalités"
                },
                "navigation": {
                    "home": "Accueil",
                    "vision": "Notre Vision",
                    "features": "Fonctionnalités",
                    "dailyProvision": "Provision Quotidienne",
                    "contact": "Contact",
                    "donation": "Don",
                    "deleteData": "Supprimer les Données"
                },
                "vision": {
                    "title": "Notre Vision chez Dévotions Chrétiennes",
                    "description": "Dévotions Chrétiennes est votre sanctuaire numérique, conçu pour être ce \"lieu à l'écart\" où vous pouvez rencontrer Dieu chaque jour. Comme Jésus se retirait pour prier, nous croyons que vous avez besoin d'un espace libre de distractions où Sa paix peut restaurer votre âme. Notre mission est d'être votre compagnon fidèle dans ce temps sacré, complètement gratuit et sans interruptions."
                },
                "dailyProvision": {
                    "title": "Comme la Manne de Chaque Jour",
                    "description": "Tout comme Dieu a fourni de la manne fraîche chaque matin dans le désert, votre app offre une nourriture spirituelle quotidienne. Les séries ne sont pas une pression, elles sont une célébration de la fidélité de Dieu qui pourvoit pour vous jour après jour. Chaque dévotion lue, chaque moment de tranquillité, est un pas de plus dans votre marche avec Lui.",
                    "streaks": {
                        "title": "Séries de Grâce",
                        "description": "Maintenez une connexion quotidienne avec Dieu. Chaque jour consécutif est une célébration de Sa fidélité et de votre recherche de Lui."
                    },
                    "achievements": {
                        "title": "Accomplissements Spirituels",
                        "description": "Célébrez votre croissance dans la foi. Chaque dévotion lue est un trésor éternel gardé dans votre cœur."
                    }
                },
                "features": {
                    "title": "Votre Refuge Spirituel Complet",
                    "content": { "title": "Contenu Spirituel" },
                    "personal": { "title": "Expérience Personnelle" },
                    "freedom": { "title": "Liberté Totale" },
                    "audioDevotionals": {
                        "title": "Dévotions Audio",
                        "description": "Écoutez la Parole pendant que vous vous reposez. Audio professionnel pour des dévotions complètes et des versets, complètement hors ligne."
                    },
                    "versions": {
                        "title": "8 Versions Bibliques",
                        "description": "Espagnol: RVR1960, NVI • Anglais: KJV, NIV • Portugais: ARC, NVI • Français: LSG1910, TOB"
                    },
                    "prayers": {
                        "title": "Centre de Prière",
                        "description": "Un espace dédié pour élever vos demandes et trouver des prières qui renforcent votre communion avec Dieu."
                    },
                    "favorites": {
                        "title": "Marquez vos Favoris",
                        "description": "Sauvegardez ces dévotions qui ont le plus touché votre cœur pour les revisiter quand vous avez besoin de cette parole spécifique."
                    },
                    "sharing": {
                        "title": "Partagez la Bénédiction",
                        "description": "Répandez l'espoir en partageant des dévotions sous forme de texte élégant ou de belles images inspirantes."
                    },
                    "themes": {
                        "title": "Personnalisez votre Espace",
                        "description": "Choisissez entre les thèmes clairs et sombres, créant l'environnement parfait pour votre temps de recueillement avec Dieu."
                    },
                    "offline": {
                        "title": "Complètement Hors Ligne",
                        "description": "Ne dépendez pas d'une connexion internet. Votre temps avec Dieu est toujours disponible, sans interruptions ni dépendances."
                    },
                    "noAds": {
                        "title": "Sanctuaire Sans Distractions",
                        "description": "Zéro publicité. Zéro interruption. Votre espace sacré protégé pour que rien ne perturbe votre communion avec Lui."
                    },
                    "languages": {
                        "title": "4 Langues Disponibles",
                        "description": "Espagnol, Anglais, Portugais, Français. La Parole de Dieu dans votre langue du cœur, avec un contenu adapté culturellement."
                    }
                },
                "contact": {
                    "title": "Des Questions? Nous Sommes Là!",
                    "description": "Si vous avez des questions, suggestions, témoignages ou si vous voulez simplement partager comment Dieu vous a parlé à travers l'app, nous aimerions vous entendre.",
                    "emailButton": "Envoyez-nous un Email",
                    "supportText": "Votre soutien nous permet de rester complètement gratuits.",
                    "donationText": "Considérez faire une offrande d'amour."
                },
                "footer": {
                    "copyright": "© 2025 Dévotions Chrétiennes. Tous droits réservés.",
                    "madeWith": "Développé avec ♥️ par develop4God",
                    "terms": "Termes et Conditions",
                    "privacy": "Politique de Confidentialité",
                    "deleteData": "Demander la Suppression des Données",
                    "contact": "Contact"
                },
                "legal": {
                    "privacy": {
                        "title": "Politique de Confidentialité - Dévotions Chrétiennes",
                        "lastUpdated": "Dernière Mise à Jour:",
                        "backToHome": "Retour à la page principale",
                        "description": "Cette Politique de Confidentialité décrit comment l'application mobile \"Dévotions Chrétiennes\" (ci-après, \"l'Application\"), détenue et opérée par **Develop4God**, gère les informations des utilisateurs. La confidentialité de nos utilisateurs est de la plus haute importance pour nous."
                    },
                    "terms": {
                        "title": "Termes et Conditions - Dévotions Chrétiennes",
                        "lastUpdated": "Dernière Mise à Jour:",
                        "backToHome": "Retour à la page principale",
                        "welcome": "Bienvenue dans l'application mobile \"Dévotions Chrétiennes\" (ci-après, \"l'Application\"), détenue et opérée par **Develop4God**. En accédant ou en utilisant l'Application, vous (\"l'Utilisateur\") acceptez d'être légalement lié par ces Termes et Conditions d'Utilisation (ci-après, \"les Termes\"). Si vous n'êtes pas d'accord avec l'un de ces Termes, vous ne devriez pas utiliser l'Application."
                    }
                }
            },
            pt: {
                "meta": {
                    "title": "Início - Devocionais Cristãos",
                    "description": "Venha e descanse. Encontre seu refúgio diário na Palavra de Deus com devocionais, áudio e conteúdo espiritual que nutre sua alma em meio à agitação do mundo."
                },
                "header": {
                    "title": "Devocionais Cristãos",
                    "mainTitle": "Venha e Descanse",
                    "subtitle": "Encontre Seu Refúgio Diário na Palavra de Deus",
                    "description": "No meio da agitação do mundo, busque primeiro Seu reino. Dedique alguns minutos todos os dias para nutrir seu espírito com devocionais, áudio e a paz que só Ele pode dar.",
                    "downloadApp": "Baixar App",
                    "learnMore": "Descobrir as Funcionalidades"
                },
                "navigation": {
                    "home": "Início",
                    "vision": "Nossa Visão",
                    "features": "Funcionalidades",
                    "dailyProvision": "Provisão Diária",
                    "contact": "Contato",
                    "donation": "Doação",
                    "deleteData": "Excluir Dados"
                },
                "vision": {
                    "title": "Nossa Visão nos Devocionais Cristãos",
                    "description": "Devocionais Cristãos é seu santuário digital, projetado para ser esse \"lugar apartado\" onde você pode se encontrar com Deus a cada dia. Como Jesus se retirava para orar, acreditamos que você precisa de um espaço livre de distrações onde Sua paz pode restaurar sua alma. Nossa missão é ser seu companheiro fiel neste tempo sagrado, completamente gratuito e sem interrupções."
                },
                "dailyProvision": {
                    "title": "Como o Maná de Cada Dia",
                    "description": "Assim como Deus proveu maná fresco todas as manhãs no deserto, seu app oferece alimento espiritual diário. As sequências não são pressão, são uma celebração da fidelidade de Deus provendo para você dia após dia. Cada devocional lido, cada momento de quietude, é mais um passo em sua caminhada com Ele.",
                    "streaks": {
                        "title": "Sequências de Graça",
                        "description": "Mantenha uma conexão diária com Deus. Cada dia consecutivo é uma celebração de Sua fidelidade e sua busca por Ele."
                    },
                    "achievements": {
                        "title": "Conquistas Espirituais",
                        "description": "Celebre seu crescimento na fé. Cada devocional lido é um tesouro eterno guardado em seu coração."
                    }
                },
                "features": {
                    "title": "Seu Refúgio Espiritual Completo",
                    "content": { "title": "Conteúdo Espiritual" },
                    "personal": { "title": "Experiência Pessoal" },
                    "freedom": { "title": "Liberdade Total" },
                    "audioDevotionals": {
                        "title": "Devocionais com Áudio",
                        "description": "Ouça a Palavra enquanto descansa. Áudio profissional para devocionais completos e versículos, completamente offline."
                    },
                    "versions": {
                        "title": "8 Versões Bíblicas",
                        "description": "Espanhol: RVR1960, NVI • Inglês: KJV, NIV • Português: ARC, NVI • Francês: LSG1910, TOB"
                    },
                    "prayers": {
                        "title": "Centro de Oração",
                        "description": "Um espaço dedicado para elevar seus pedidos e encontrar orações que fortaleçam sua comunhão com Deus."
                    },
                    "favorites": {
                        "title": "Marque seus Favoritos",
                        "description": "Guarde aqueles devocionais que mais tocaram seu coração para revisitá-los quando precisar dessa palavra específica."
                    },
                    "sharing": {
                        "title": "Compartilhe a Bênção",
                        "description": "Espalhe a esperança compartilhando devocionais como texto elegante ou belas imagens inspiradoras."
                    },
                    "themes": {
                        "title": "Personalize seu Espaço",
                        "description": "Escolha entre temas claros e escuros, criando o ambiente perfeito para seu tempo de quietude com Deus."
                    },
                    "offline": {
                        "title": "Completamente Offline",
                        "description": "Não dependa de conexão com a internet. Seu tempo com Deus está sempre disponível, sem interrupções ou dependências."
                    },
                    "noAds": {
                        "title": "Santuário Sem Distrações",
                        "description": "Zero anúncios. Zero interrupções. Seu espaço sagrado protegido para que nada perturbe sua comunhão com Ele."
                    },
                    "languages": {
                        "title": "4 Idiomas Disponíveis",
                        "description": "Espanhol, Inglês, Português, Francês. A Palavra de Deus em seu idioma do coração, com conteúdo adaptado culturalmente."
                    }
                },
                "contact": {
                    "title": "Dúvidas? Estamos Aqui!",
                    "description": "Se você tem alguma dúvida, sugestão, testemunho ou simplesmente quer compartilhar como Deus falou com você através do app, adoraríamos ouvir você.",
                    "emailButton": "Envie-nos um Email",
                    "supportText": "Seu apoio nos permite continuar completamente gratuitos.",
                    "donationText": "Considere fazer uma oferta de amor."
                },
                "footer": {
                    "copyright": "© 2025 Devocionais Cristãos. Todos os direitos reservados.",
                    "madeWith": "Desenvolvido com ♥️ por develop4God",
                    "terms": "Termos e Condições",
                    "privacy": "Política de Privacidade",
                    "deleteData": "Solicitar Exclusão de Dados",
                    "contact": "Contato"
                },
                "legal": {
                    "privacy": {
                        "title": "Política de Privacidade - Devocionais Cristãos",
                        "lastUpdated": "Data da Última Atualização:",
                        "backToHome": "Voltar à página principal",
                        "description": "Esta Política de Privacidade descreve como o aplicativo móvel \"Devocionais Cristãos\" (doravante, \"o Aplicativo\"), de propriedade e operado por **Develop4God**, lida com as informações do usuário. A privacidade de nossos usuários é de suma importância para nós."
                    },
                    "terms": {
                        "title": "Termos e Condições - Devocionais Cristãos",
                        "lastUpdated": "Data da Última Atualização:",
                        "backToHome": "Voltar à página principal",
                        "welcome": "Bem-vindo ao aplicativo móvel \"Devocionais Cristãos\" (doravante, \"o Aplicativo\"), de propriedade e operado por **Develop4God**. Ao acessar ou usar o Aplicativo, você (\"o Usuário\") concorda em estar legalmente vinculado a estes Termos e Condições de Uso (doravante, \"os Termos\"). Se você não concordar com algum destes Termos, não deve usar o Aplicativo."
                    }
                }
            }
        };
    }

    async init() {
        // Detect user's preferred language
        this.detectLanguage();
        
        // Load translations
        this.loadTranslations(this.currentLang);
        
        // Apply translations to the page
        this.translatePage();
        
        // Setup language selector
        this.setupLanguageSelector();
        
        // Update HTML lang attribute
        document.documentElement.lang = this.currentLang;
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
                const savedLang = localStorage.getItem('preferred-language');
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

    loadTranslations(lang) {
        if (this.allTranslations[lang]) {
            this.translations = this.allTranslations[lang];
        } else {
            console.warn(`Translations not found for ${lang}, falling back to Spanish`);
            this.translations = this.allTranslations.es;
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

        this.currentLang = lang;
        
        // Save preference (fallback to memory if localStorage fails)
        try {
            localStorage.setItem('preferred-language', lang);
        } catch (e) {
            console.warn('Could not save language preference to localStorage');
        }
        
        this.loadTranslations(lang);
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
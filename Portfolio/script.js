// Asegurar el registro de los plugins adicionales de GSAP
gsap.registerPlugin(ScrollTrigger, Flip);

// --- 1. INTRO CON EL ORDENADOR EN 3D CONTROLADO POR SCROLL ---
const initLaptopScrollIntro = () => {
    const laptop = document.getElementById('interactive-laptop');
    const introContainer = document.querySelector('.intro-3d-container');
    
    if (!laptop || !introContainer) return;

    // Línea de tiempo que retiene la pantalla e inclina el ordenador en 3D
    const introTimeline = gsap.timeline({
        scrollTrigger: {
            trigger: introContainer,
            start: "top top",      
            end: "+=120%",         // Cuánto scroll se necesita para completar la animación
            scrub: 1,              // Movimiento elástico y fluido ligado al scroll
            pin: true,             // Congela el scroll de la web durante la animación
            anticipatePin: 1
        }
    });

    introTimeline
        .to(laptop, {
            rotateX: 65,          // Inclinación hacia atrás en perspectiva
            rotateY: -15,         // Rotación lateral sutil
            scale: 0.35,          // Reducción de escala para alejarlo
            y: -160,              // Desplazamiento hacia el borde superior
            opacity: 0,           // Desvanecimiento completo
            duration: 2
        })
        .to(".scroll-hint", {
            opacity: 0,
            y: -20,
            duration: 0.5
        }, "<")                   // Se ejecuta simulando simultáneamente con la animación inicial del Mac
        .to(".navbar", {
            opacity: 1,           // Revela el menú flotante justo al terminar la intro
            pointerEvents: "auto",
            duration: 0.8
        }, "-=0.5");              
};

// --- 2. ANIMACIÓN DE ENTRADA HERO Y MÁSCARA MORPHING EXPANDIDA ---
const initHeroAnimations = () => {
    // Orquestación en cascada de los textos del Hero
    gsap.from(".gsap-fade", {
        scrollTrigger: {
            trigger: ".hero-section",
            start: "top 40%" // Se dispara de forma natural tras pasar la intro del laptop
        },
        y: 40,
        opacity: 0,
        stagger: 0.15,
        duration: 1.2,
        ease: "power4.out"
    });

    const blobPath = document.getElementById("vector-blob");
    
    // Coordenadas optimizadas: se expanden hacia fuera para dejar el centro totalmente libre para tu cara
    const shape1 = "M0.75,0.20 C0.85,0.32,0.92,0.45,0.90,0.58 C0.88,0.71,0.77,0.84,0.65,0.90 C0.53,0.96,0.40,0.95,0.28,0.89 C0.16,0.83,0.05,0.72,0.02,0.59 C-0.01,0.46,0.04,0.31,0.13,0.21 C0.22,0.11,0.36,0.05,0.50,0.04 C0.64,0.03,0.65,0.08,0.75,0.20Z";
    const shape2 = "M0.80,0.25 C0.88,0.35,0.95,0.48,0.93,0.60 C0.91,0.72,0.80,0.82,0.68,0.88 C0.56,0.94,0.42,0.95,0.30,0.90 C0.18,0.85,0.08,0.74,0.06,0.62 C0.04,0.50,0.10,0.36,0.18,0.26 C0.26,0.16,0.38,0.10,0.52,0.09 C0.66,0.08,0.72,0.15,0.80,0.25Z";

    if (blobPath) {
        // Fijamos el estado inicial abierto y seguro
        gsap.set(blobPath, { attr: { d: shape1 } });

        // Animación elástica continua perimetral (suave y pausada a 5 segundos)
        gsap.to(blobPath, {
            attr: { d: shape2 },
            duration: 5,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut"
        });
    }
};

// --- 3. ANIMACIÓN DE GRÁFICOS 3D (Cubo de Tecnologías en Rotación Infinita) ---
const init3DCube = () => {
    gsap.to(".cube-3d", {
        rotateX: 360,
        rotateY: 360,
        duration: 12,
        repeat: -1,
        ease: "none"
    });

    // Ligera oscilación de la escena 3D en base al movimiento del puntero del ratón
    window.addEventListener("mousemove", (e) => {
        const xPercent = (e.clientX / window.innerWidth) - 0.5;
        const yPercent = (e.clientY / window.innerHeight) - 0.5;
        
        gsap.to(".scene-3d", {
            x: xPercent * 40,
            y: yPercent * 40,
            duration: 0.8,
            ease: "power1.out"
        });
    });
};

// --- 4. ANIMACIONES CONTROLADAS POR SCROLL (ScrollTrigger general) ---
const initScrollAnimations = () => {
    // Revelado sutil de los títulos de las secciones
    const titles = document.querySelectorAll('.trigger-title');
    titles.forEach(title => {
        gsap.from(title, {
            scrollTrigger: {
                trigger: title,
                start: "top 85%",
                toggleActions: "play none none none"
            },
            opacity: 0,
            y: 30,
            duration: 0.8,
            ease: "power2.out"
        });
    });

    // Entrada elegante de los paneles principales
    const cards = document.querySelectorAll('.trigger-card');
    cards.forEach(card => {
        gsap.from(card, {
            scrollTrigger: {
                trigger: card,
                start: "top 80%"
            },
            opacity: 0,
            y: 50,
            duration: 1,
            ease: "power3.out"
        });
    });

    // Despliegue en ráfaga elástica (Stagger) de tus tarjetas de habilidades
    gsap.from(".anim-skill", {
        scrollTrigger: {
            trigger: ".skills-section",
            start: "top 70%"
        },
        opacity: 0,
        scale: 0.9,
        y: 30,
        stagger: 0.1,
        duration: 0.8,
        ease: "back.out(1.7)"
    });

    // Crecimiento reactivo de la línea vertical en la sección de Experiencia
    gsap.to(".timeline-progress-bar", {
        scrollTrigger: {
            trigger: ".timeline-wrapper",
            start: "top 60%",
            end: "bottom 60%",
            scrub: true
        },
        height: "100%",
        ease: "none"
    });

    // Activación progresiva y encendido de los nodos de la línea cronológica
    const timelineItems = document.querySelectorAll('.anim-timeline');
    timelineItems.forEach(item => {
        gsap.from(item.querySelector('.timeline-content'), {
            scrollTrigger: {
                trigger: item,
                start: "top 75%",
                onEnter: () => item.classList.add('active-dot'),
                onLeaveBack: () => item.classList.remove('active-dot')
            },
            opacity: 0,
            x: -40,
            duration: 0.8,
            ease: "power2.out"
        });
    });
};

// --- 5. TRANSICIÓN DE ESTADOS FLUIDA CON REAJUSTE INTELIGENTE (Plugin FLIP) ---
const initFlipFiltering = () => {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const projectItems = document.querySelectorAll('.filter-item');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.filter-btn.active').classList.remove('active');
            btn.classList.add('active');

            const filterValue = btn.getAttribute('data-filter');

            // Captura el estado posicional exacto de las tarjetas antes del cambio estructural
            const state = Flip.getState(projectItems);

            projectItems.forEach(item => {
                const tech = item.getAttribute('data-tech');
                if (filterValue === 'all' || tech === filterValue) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });

            // Reajuste fluido interpolando dimensiones y vectores de posición
            Flip.from(state, {
                duration: 0.6,
                ease: "power2.inOut",
                absolute: true, 
                onComplete: () => {
                    ScrollTrigger.refresh(); // Actualiza las métricas de scroll por si la web cambia de altura
                }
            });
        });
    });
};

// --- 6. ELEMENTO ARRASTRABLE CON FÍSICAS DE AMORTIGUACIÓN ELÁSTICA (Widget) ---
const initDraggableWidget = () => {
    const widget = document.getElementById('draggable-widget');
    if (!widget) return;

    let isDragging = false;
    let startX, startY;

    const startDrag = (e) => {
        isDragging = true;
        const pageX = e.type === "touchstart" ? e.touches[0].pageX : e.pageX;
        const pageY = e.type === "touchstart" ? e.touches[0].pageY : e.pageY;
        
        startX = pageX - widget.offsetLeft;
        startY = pageY - widget.offsetTop;
        
        gsap.to(widget, { scale: 1.1, boxShadow: "0 15px 30px rgba(251, 191, 36, 0.3)", duration: 0.2 });
    };

    const doDrag = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        
        const pageX = e.type === "touchmove" ? e.touches[0].pageX : e.pageX;
        const pageY = e.type === "touchmove" ? e.touches[0].pageY : e.pageY;

        let x = pageX - startX;
        let y = pageY - startY;

        // Previene que el widget salga de las fronteras visibles del navegador
        x = Math.max(10, Math.min(x, window.innerWidth - widget.offsetWidth - 10));
        y = Math.max(10, Math.min(y, window.innerHeight - widget.offsetHeight - 10));

        gsap.set(widget, { left: x, top: y, bottom: 'auto', right: 'auto' });
    };

    const stopDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        gsap.to(widget, { scale: 1, boxShadow: "0 10px 25px rgba(251, 191, 36, 0.15)", duration: 0.3, ease: "back.out(2)" });
    };

    widget.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);

    widget.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', doDrag, { passive: false });
    window.addEventListener('touchend', stopDrag);
};

// --- 7. MENÚ HAMBURGUESA MÓVIL REGULAR ---
const initNavbarBurger = () => {
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');
    const navLinks = document.querySelectorAll('.nav-links li');

    if(!burger) return;

    burger.addEventListener('click', () => {
        nav.classList.toggle('nav-active');
        burger.classList.toggle('toggle');
    });

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('nav-active');
            burger.classList.remove('toggle');
        });
    });
};

// --- 8. ENVÍO DE FORMULARIO VÍA ASYNC/FETCH (Formspree) ---
const initFormspreeHandler = () => {
    const form = document.getElementById('contact-form');
    const submitBtn = document.getElementById('form-btn');

    if (!form) return;

    form.addEventListener('submit', async function(event) {
        event.preventDefault();
        submitBtn.disabled = true;
        submitBtn.innerText = 'Enviando...';

        const formData = new FormData(this);
        const actionUrl = this.getAttribute('action');

        try {
            const response = await fetch(actionUrl, {
                method: 'POST',
                body: formData,
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                this.reset();
                alert('¡Gracias! Tu mensaje ha sido enviado correctamente.');
            } else {
                alert('Hubo un problema al procesar el envío. Por favor, inténtalo de nuevo.');
            }
        } catch (error) {
            alert('Error de conexión. Inténtalo de nuevo.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Enviar Mensaje';
        }
    });
};

// Orquestación unificada al levantar la carga del DOM
document.addEventListener('DOMContentLoaded', () => {
    initLaptopScrollIntro();
    initHeroAnimations();
    init3DCube();
    initScrollAnimations();
    initFlipFiltering();
    initDraggableWidget();
    initNavbarBurger();
    initFormspreeHandler();
});
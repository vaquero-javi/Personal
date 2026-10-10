gsap.registerPlugin(ScrollTrigger, Flip);

const EASE = "expo.out";
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- 1. TEMA CLARO / OSCURO ---
const initThemeToggle = () => {
    const toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;

    const currentTheme = () => {
        const explicit = document.documentElement.dataset.theme;
        if (explicit) return explicit;
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    };

    toggle.addEventListener('click', () => {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem('theme', next); } catch (e) {}
    });
};

// --- 2. NAVEGACIÓN: sombra al hacer scroll, enlace activo y menú móvil ---
const initNavbar = () => {
    const navbar = document.querySelector('.navbar');
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');
    const links = document.querySelectorAll('.nav-links a');

    ScrollTrigger.create({
        start: 40,
        end: "max",
        toggleClass: { targets: navbar, className: "is-scrolled" }
    });

    // Marca el enlace de la sección visible
    links.forEach(link => {
        const section = document.querySelector(link.getAttribute('href'));
        if (!section) return;
        ScrollTrigger.create({
            trigger: section,
            start: "top 45%",
            end: "bottom 45%",
            onToggle: self => link.classList.toggle('is-active', self.isActive)
        });
    });

    if (!burger) return;

    const setOpen = (open) => {
        nav.classList.toggle('nav-active', open);
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    };

    burger.addEventListener('click', () => setOpen(!nav.classList.contains('nav-active')));
    links.forEach(link => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
};

// --- 3. ANIMACIONES DE ENTRADA Y SCROLL (solo sin movimiento reducido) ---
const initMotion = () => {
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Entrada del hero: jerarquía de lectura (etiqueta, título, texto, botones)
        gsap.timeline({ defaults: { ease: EASE } })
            .from(".hero-reveal", { y: 32, opacity: 0, duration: 1.1, stagger: 0.09 })
            .from(".hero-reveal-img", { y: 40, opacity: 0, scale: 0.97, duration: 1.3 }, 0.15);

        // Bloques que aparecen al entrar en pantalla
        ScrollTrigger.batch(".reveal", {
            start: "top 85%",
            once: true,
            onEnter: els => gsap.from(els, { y: 36, opacity: 0, duration: 1, stagger: 0.1, ease: EASE })
        });

        // Bento de habilidades en cascada
        gsap.from(".reveal-tile", {
            scrollTrigger: { trigger: ".bento", start: "top 80%", once: true },
            y: 40,
            opacity: 0,
            duration: 1,
            stagger: 0.08,
            ease: EASE
        });

        // La línea de experiencia avanza con el scroll
        gsap.fromTo(".timeline-progress-bar", { scaleY: 0 }, {
            scaleY: 1,
            ease: "none",
            scrollTrigger: {
                trigger: ".timeline-wrapper",
                start: "top 60%",
                end: "bottom 60%",
                scrub: true
            }
        });

        document.querySelectorAll('.timeline-item').forEach(item => {
            gsap.from(item.querySelectorAll('.timeline-date, .timeline-content'), {
                scrollTrigger: {
                    trigger: item,
                    start: "top 70%",
                    onEnter: () => item.classList.add('active-dot'),
                    onLeaveBack: () => item.classList.remove('active-dot')
                },
                y: 24,
                opacity: 0,
                duration: 0.9,
                stagger: 0.08,
                ease: EASE
            });
        });
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
        document.querySelectorAll('.timeline-item').forEach(item => item.classList.add('active-dot'));
    });
};

// --- 4. FILTRO DE PROYECTOS CON TRANSICIÓN FLIP ---
const initFlipFiltering = () => {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const projectItems = document.querySelectorAll('.filter-item');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => {
                b.classList.toggle('active', b === btn);
                b.setAttribute('aria-pressed', String(b === btn));
            });

            const filterValue = btn.dataset.filter;
            const state = Flip.getState(projectItems);

            projectItems.forEach(item => {
                const visible = filterValue === 'all' || item.dataset.tech === filterValue;
                item.style.display = visible ? '' : 'none';
            });

            Flip.from(state, {
                duration: prefersReducedMotion() ? 0 : 0.7,
                ease: "power3.inOut",
                absolute: true,
                onEnter: els => gsap.fromTo(els, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.5 }),
                onLeave: els => gsap.to(els, { opacity: 0, scale: 0.96, duration: 0.3 }),
                onComplete: () => ScrollTrigger.refresh()
            });
        });
    });
};

// --- 5. FORMULARIO (Formspree) CON VALIDACIÓN Y ESTADOS EN LÍNEA ---
const initFormspreeHandler = () => {
    const form = document.getElementById('contact-form');
    const submitBtn = document.getElementById('form-btn');
    const status = form ? form.querySelector('.form-status') : null;
    if (!form) return;

    const btnLabel = submitBtn.innerHTML;

    const setFieldError = (input, message) => {
        const field = input.closest('.field');
        const error = document.getElementById(`${input.id}-error`);
        field.classList.toggle('has-error', Boolean(message));
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
        if (message) input.setAttribute('aria-describedby', error.id);
        else input.removeAttribute('aria-describedby');
        error.textContent = message;
    };

    const validate = () => {
        let firstInvalid = null;
        form.querySelectorAll('input[required], textarea[required]').forEach(input => {
            let message = '';
            if (!input.value.trim()) message = 'Este campo es obligatorio.';
            else if (input.type === 'email' && !input.validity.valid) message = 'Introduce un correo válido.';
            setFieldError(input, message);
            if (message && !firstInvalid) firstInvalid = input;
        });
        if (firstInvalid) firstInvalid.focus();
        return !firstInvalid;
    };

    form.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('input', () => {
            if (input.closest('.field')?.classList.contains('has-error')) setFieldError(input, '');
        });
    });

    const setStatus = (text, type) => {
        status.textContent = text;
        status.className = `form-status${type ? ` is-${type}` : ''}`;
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setStatus('', '');
        if (!validate()) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                form.reset();
                setStatus('¡Gracias! Tu mensaje se ha enviado correctamente.', 'success');
            } else {
                setStatus('No se pudo enviar el mensaje. Inténtalo de nuevo.', 'error');
            }
        } catch (error) {
            setStatus('Error de conexión. Revisa tu red e inténtalo de nuevo.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = btnLabel;
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initNavbar();
    initMotion();
    initFlipFiltering();
    initFormspreeHandler();
});

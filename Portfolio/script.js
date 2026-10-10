const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Si GSAP no carga (sin red, bloqueado), la página se ve completa y estática
const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
const animate = hasGsap && !reducedMotion;

let lenis = null;

// --- 1. SCROLL SUAVE (Lenis) SINCRONIZADO CON GSAP ---
const initSmoothScroll = () => {
    if (!animate || typeof window.Lenis === 'undefined') return;
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
};

const scrollToHash = hash => {
    const target = hash === '#inicio' ? 0 : document.querySelector(hash);
    if (target === null) return;
    if (lenis) lenis.scrollTo(target, { offset: target === 0 ? 0 : -16, duration: 1.4 });
    else if (target === 0) window.scrollTo({ top: 0 });
    else target.scrollIntoView();
};

const initAnchors = () => {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', event => {
            const hash = link.getAttribute('href');
            if (hash.length < 2) return;
            event.preventDefault();
            closeMenu();
            scrollToHash(hash);
            history.replaceState(null, '', hash);
        });
    });
};

// --- 2. CABECERA, PROGRESO Y MENÚ ---
const menu = document.getElementById('menu');
const menuBtn = document.querySelector('.menu-btn');

const setMenu = open => {
    if (!menu) return;
    menu.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.querySelector('.menu-btn-label').textContent = open ? 'Cerrar' : 'Menú';
    if (lenis) open ? lenis.stop() : lenis.start();
    else document.body.style.overflow = open ? 'hidden' : '';
    if (open) menu.querySelector('a')?.focus({ preventScroll: true });
};
const closeMenu = () => {
    if (menu?.classList.contains('is-open')) {
        setMenu(false);
        menuBtn.focus({ preventScroll: true });
    }
};

const initMenu = () => {
    if (!menu) return;
    menu.hidden = false;
    menu.setAttribute('aria-hidden', 'true');
    menu.inert = true;
    menuBtn.addEventListener('click', () => {
        const open = !menu.classList.contains('is-open');
        setMenu(open);
        menu.inert = !open;
        menu.setAttribute('aria-hidden', String(!open));
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeMenu();
            menu.inert = true;
            menu.setAttribute('aria-hidden', 'true');
        }
    });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
        menu.inert = true;
        menu.setAttribute('aria-hidden', 'true');
    }));
};

const initTopbar = () => {
    const bar = document.querySelector('.topbar');
    const navLinks = [...document.querySelectorAll('.topnav a')];
    const progress = document.querySelector('.progress-bar');

    const onScroll = (y, direction) => {
        bar.classList.toggle('is-solid', y > 40);
        // Se esconde al bajar pasada la portada y reaparece al subir
        const hide = direction > 0 && y > window.innerHeight * 0.8 && !menu.classList.contains('is-open');
        bar.classList.toggle('is-hidden', hide);
    };

    if (hasGsap) {
        ScrollTrigger.create({
            start: 0,
            end: 'max',
            onUpdate: self => {
                onScroll(self.scroll(), self.direction);
                progress.style.transform = `scaleX(${self.progress})`;
            }
        });
        // Enlace activo según la sección en pantalla
        navLinks.forEach(link => {
            const section = document.querySelector(link.getAttribute('href'));
            if (!section) return;
            ScrollTrigger.create({
                trigger: section,
                start: 'top 50%',
                end: 'bottom 50%',
                onToggle: self => link.classList.toggle('is-active', self.isActive)
            });
        });
    } else {
        let last = 0;
        window.addEventListener('scroll', () => {
            const y = window.scrollY;
            onScroll(y, y > last ? 1 : -1);
            last = y;
            const max = root.scrollHeight - window.innerHeight;
            progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
        }, { passive: true });
    }
};

// --- 3. HORA DE MADRID ---
const initClock = () => {
    const clocks = document.querySelectorAll('[data-clock]');
    const format = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
    const tick = () => clocks.forEach(el => { el.textContent = format.format(new Date()); });
    tick();
    setInterval(tick, 30000);
};

// --- 4. UTILIDADES PARA DIVIDIR TEXTO ---
const splitChars = el => {
    el.innerHTML = [...el.textContent].map(c => `<span class="char">${c}</span>`).join('');
    return el.querySelectorAll('.char');
};
const splitWords = el => {
    el.innerHTML = el.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
    return el.querySelectorAll('.w');
};

// --- 5. ANIMACIONES DE SCROLL ---
const initMotion = () => {
    if (!animate) {
        document.querySelectorAll('.job').forEach(job => job.classList.add('is-lit'));
        return;
    }
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    // Portada: letras que suben, foto que se descubre y textos que entran
    const chars = [...document.querySelectorAll('.hero-name .split')].flatMap(el => [...splitChars(el)]);
    const intro = gsap.timeline({ defaults: { ease: 'expo.out' }, delay: 0.1 });
    intro
        .from(chars, { yPercent: 110, duration: 1.3, stagger: 0.035 })
        .from('.hero-photo', { clipPath: 'inset(100% 0 0 0)', duration: 1.4 }, 0.25)
        .from('.hero-photo img', { scale: 1.3, duration: 1.8 }, 0.25)
        .from('.hero-meta > *, .hero-copy > *, .scroll-cue', { y: 20, opacity: 0, duration: 1, stagger: 0.06 }, 0.5);

    // Al salir de la portada, las dos líneas del nombre se separan y la foto hace parallax
    const heroOut = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
    gsap.to('.hero-line--a .split', { xPercent: -12, ease: 'none', scrollTrigger: heroOut });
    gsap.to('.hero-line--b .split', { xPercent: 12, ease: 'none', scrollTrigger: heroOut });
    gsap.to('.hero-photo img', { yPercent: -12, ease: 'none', scrollTrigger: heroOut });

    // Cinta de tecnologías: avanza sola y acelera (o cambia de sentido) con la velocidad del scroll
    const ticker = gsap.to('.ticker-track', { xPercent: -50, duration: 40, ease: 'none', repeat: -1 });
    let direction = 1;
    ScrollTrigger.create({
        trigger: '.ticker',
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: self => {
            direction = self.direction;
            const boost = Math.min(Math.abs(self.getVelocity()) / 250, 6);
            gsap.to(ticker, { timeScale: direction * (1 + boost), duration: 0.3, overwrite: true });
            gsap.to(ticker, { timeScale: direction, duration: 1.2, delay: 0.3, ease: 'power2.out' });
        }
    });

    // Sobre mí: las palabras se encienden según avanzas
    document.querySelectorAll('[data-scrub-words]').forEach(el => {
        gsap.fromTo(splitWords(el), { opacity: 0.12 }, {
            opacity: 1,
            stagger: 0.1,
            ease: 'none',
            scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 40%', scrub: true }
        });
    });

    // Bloques que suben al entrar; los que entran a la vez llegan escalonados
    gsap.set('[data-rise]', { y: 40, opacity: 0 });
    ScrollTrigger.batch('[data-rise]', {
        start: 'top 88%',
        once: true,
        onEnter: batch => gsap.to(batch, { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.08 })
    });

    // Títulos de sección: el número y el título se deslizan desde abajo
    document.querySelectorAll('.sec-head').forEach(head => {
        gsap.from(head.children, {
            yPercent: 60,
            opacity: 0,
            duration: 1.1,
            ease: 'expo.out',
            stagger: 0.08,
            scrollTrigger: { trigger: head, start: 'top 85%', once: true }
        });
    });

    // Habilidades: en escritorio la sección se fija y las tarjetas pasan en horizontal
    mm.add('(min-width: 901px)', () => {
        const track = document.querySelector('.skills-track');
        const distance = () => track.scrollWidth - window.innerWidth;
        const tween = gsap.to(track, {
            x: () => -distance(),
            ease: 'none',
            scrollTrigger: {
                trigger: '.skills-pin',
                start: 'top top',
                end: () => `+=${distance()}`,
                pin: true,
                scrub: 1,
                invalidateOnRefresh: true,
                anticipatePin: 1
            }
        });
        // Cada tarjeta gira y se asienta al entrar por la derecha
        gsap.utils.toArray('.skill-card').forEach(card => {
            gsap.from(card, {
                rotate: 4,
                yPercent: 10,
                opacity: 0.3,
                ease: 'none',
                scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left 100%', end: 'left 60%', scrub: true }
            });
        });
    });

    // Proyectos: cuando la siguiente tarjeta sube, la anterior se encoge y se oscurece
    const cards = gsap.utils.toArray('.stack-card');
    cards.forEach((card, i) => {
        const next = cards[i + 1];
        if (!next) return;
        gsap.to(card.querySelector('.stack-inner'), {
            scale: 0.9,
            opacity: 0.35,
            ease: 'none',
            scrollTrigger: { trigger: next, start: 'top bottom', end: 'top 15%', scrub: true }
        });
    });

    // Experiencia: la línea se dibuja con el scroll y cada punto se enciende al llegar
    const line = document.querySelector('.timeline-line span');
    gsap.fromTo(line, { scaleY: 0 }, {
        scaleY: 1,
        ease: 'none',
        scrollTrigger: { trigger: '.timeline', start: 'top 65%', end: 'bottom 65%', scrub: true }
    });
    document.querySelectorAll('.job').forEach(job => {
        ScrollTrigger.create({
            trigger: job,
            start: 'top 65%',
            onEnter: () => job.classList.add('is-lit'),
            onLeaveBack: () => job.classList.remove('is-lit')
        });
    });

    // Contacto: las líneas del titular suben una tras otra
    document.querySelectorAll('.contact-big-line').forEach(lineEl => {
        lineEl.innerHTML = `<span>${lineEl.innerHTML}</span>`;
    });
    gsap.from('.contact-big-line > span', {
        yPercent: 105,
        duration: 1.2,
        ease: 'expo.out',
        stagger: 0.1,
        scrollTrigger: { trigger: '.contact-big', start: 'top 80%', once: true }
    });

    // Pie: el nombre gigante se desliza en horizontal con el scroll
    gsap.fromTo('.footer-name', { xPercent: 10 }, {
        xPercent: 0,
        ease: 'none',
        scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true }
    });

    // Recalcula posiciones cuando cargan las fuentes (cambian las medidas)
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
};

// --- 6. VÍDEOS: se reproducen en silencio solo mientras están en pantalla ---
const initVideos = () => {
    const videos = document.querySelectorAll('video[data-autoplay]');
    if (!videos.length || reducedMotion || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
        entries.forEach(({ target, isIntersecting }) => {
            if (isIntersecting) target.play().catch(() => {});
            else target.pause();
        });
    }, { threshold: 0.4 });
    videos.forEach(video => io.observe(video));
};

// --- 7. COPIAR CORREO ---
const initCopy = () => {
    document.querySelectorAll('[data-copy]').forEach(btn => {
        const label = btn.querySelector('.copy-label');
        btn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(btn.dataset.copy);
                btn.classList.add('is-done');
                label.textContent = 'Copiado';
            } catch (e) {
                label.textContent = 'No se pudo copiar';
            }
            setTimeout(() => {
                btn.classList.remove('is-done');
                label.textContent = 'Copiar';
            }, 2000);
        });
    });
};

// --- 8. FORMULARIO (Formspree) CON VALIDACIÓN Y ESTADOS EN LÍNEA ---
const initContactForm = () => {
    const form = document.getElementById('contact-form');
    if (!form) return;
    const submitBtn = document.getElementById('form-btn');
    const status = form.querySelector('.form-status');
    const btnLabel = submitBtn.innerHTML;

    const setFieldError = (input, message) => {
        const error = document.getElementById(`${input.id}-error`);
        const field = input.closest('.field');
        field.classList.toggle('has-error', Boolean(message));
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
        if (message) input.setAttribute('aria-describedby', error.id);
        else input.removeAttribute('aria-describedby');
        error.textContent = message;
    };

    const validate = () => {
        let firstInvalid = null;
        form.querySelectorAll('[required]').forEach(input => {
            let message = '';
            if (!input.value.trim()) message = 'Este campo es obligatorio.';
            else if (input.type === 'email' && !input.validity.valid) message = 'Introduce un correo válido.';
            setFieldError(input, message);
            if (message && !firstInvalid) firstInvalid = input;
            // Sacudida corta para señalar el campo con error; se reinicia en cada envío fallido
            const field = input.closest('.field');
            field.classList.remove('is-shaking');
            if (message) {
                void field.offsetWidth;
                field.classList.add('is-shaking');
            }
        });
        firstInvalid?.focus();
        return !firstInvalid;
    };

    form.querySelectorAll('[required]').forEach(input => {
        input.addEventListener('input', () => {
            if (input.closest('.field').classList.contains('has-error')) setFieldError(input, '');
        });
    });

    const setStatus = (text, type = '') => {
        status.textContent = text;
        status.className = `form-status${type ? ` is-${type}` : ''}`;
    };

    form.addEventListener('submit', async event => {
        event.preventDefault();
        setStatus('');
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
    initSmoothScroll();
    initMenu();
    initAnchors();
    // Primero las animaciones (crean el anclaje de Habilidades) y después los disparadores de la cabecera,
    // para que estos ya cuenten con el espacio extra del anclaje
    initMotion();
    initTopbar();
    initClock();
    initVideos();
    initCopy();
    initContactForm();
});

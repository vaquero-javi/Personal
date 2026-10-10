const root = document.documentElement;

// --- 1. TEMA CLARO / OSCURO ---
const initTheme = () => {
    const toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;

    const current = () => root.dataset.theme
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    toggle.addEventListener('click', () => {
        const next = current() === 'dark' ? 'light' : 'dark';
        const apply = () => { root.dataset.theme = next; };
        // Fundido entre temas para evitar el salto brusco de brillo, donde el navegador lo permite
        if (document.startViewTransition) document.startViewTransition(apply);
        else apply();
        try { localStorage.setItem('theme', next); } catch (e) {}
    });
};

// --- 2. CABECERA: borde al hacer scroll, enlace activo y menú móvil ---
const initHeader = () => {
    const header = document.querySelector('.site-header');
    const sentinel = document.querySelector('.scroll-sentinel');
    const nav = document.getElementById('site-nav');
    const toggle = document.querySelector('.menu-toggle');
    const links = [...nav.querySelectorAll('a')];

    // Borde inferior en cuanto la página deja de estar arriba del todo
    new IntersectionObserver(([entry]) => {
        header.classList.toggle('is-scrolled', !entry.isIntersecting);
    }).observe(sentinel);

    // Barra única bajo el enlace activo: viaja de uno a otro con el muelle de --spring.
    // Es una transición CSS, así que si cambia de destino a mitad de camino sale desde donde está.
    const indicator = document.createElement('span');
    indicator.className = 'nav-indicator is-placing';
    indicator.setAttribute('aria-hidden', 'true');
    nav.querySelector('ul').append(indicator);

    let activeLink = null;
    const placeIndicator = () => {
        if (!activeLink) {
            indicator.classList.remove('is-visible');
            return;
        }
        indicator.style.setProperty('--x', `${activeLink.offsetLeft}px`);
        indicator.style.setProperty('--w', activeLink.offsetWidth);
        indicator.classList.add('is-visible');
    };
    const setActive = link => {
        if (link === activeLink) return;
        activeLink = link;
        links.forEach(l => l.classList.toggle('is-active', l === link));
        placeIndicator();
        // Tras colocarse por primera vez, a partir de ahora se desplaza
        if (link) requestAnimationFrame(() => requestAnimationFrame(() => indicator.classList.remove('is-placing')));
    };
    window.addEventListener('resize', placeIndicator);
    document.fonts?.ready.then(placeIndicator);

    // Enlace activo según la sección que ocupa el centro de la pantalla
    const byId = new Map(links.map(link => [link.getAttribute('href').slice(1), link]));
    const sectionObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            setActive(byId.get(entry.target.id) || null);
        });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main section[id]').forEach(section => sectionObserver.observe(section));

    const setOpen = open => {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    links.forEach(link => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
};

// --- 3. ANIMACIONES: entrada del hero, apariciones y texto de "Sobre mí" ---
const initMotion = () => {
    // Divide la declaración en palabras para encenderlas al hacer scroll
    document.querySelectorAll('[data-words]').forEach(el => {
        el.innerHTML = el.textContent.trim().split(/\s+/)
            .map(word => `<span class="w">${word}</span>`).join(' ');
    });

    // Arranca la entrada del hero cuando las fuentes están listas, para no animar con la fuente de reserva
    const ready = () => requestAnimationFrame(() => root.classList.add('is-ready'));
    if (document.fonts?.ready) {
        Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 800))]).then(ready);
    } else {
        ready();
    }

    const targets = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
        targets.forEach(el => el.classList.add('is-in'));
        return;
    }
    // Los elementos que entran en pantalla a la vez llegan escalonados, como mucho 4 pasos
    const io = new IntersectionObserver(entries => {
        entries.filter(entry => entry.isIntersecting).forEach((entry, i) => {
            entry.target.style.setProperty('--stagger', `${Math.min(i, 4) * 70}ms`);
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -12% 0px' });
    targets.forEach(el => io.observe(el));
};

// --- 4. VÍDEOS: se reproducen en silencio solo mientras están en pantalla ---
const initVideos = () => {
    const videos = document.querySelectorAll('video[data-autoplay]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!videos.length || reduced || !('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver(entries => {
        entries.forEach(({ target, isIntersecting }) => {
            if (isIntersecting) target.play().catch(() => {});
            else target.pause();
        });
    }, { threshold: 0.4 });
    videos.forEach(video => io.observe(video));
};

// --- 5. FORMULARIO (Formspree) CON VALIDACIÓN Y ESTADOS EN LÍNEA ---
const initContactForm = () => {
    const form = document.getElementById('contact-form');
    if (!form) return;
    const submitBtn = document.getElementById('form-btn');
    const status = form.querySelector('.form-status');
    const btnLabel = submitBtn.innerHTML;

    const setFieldError = (input, message) => {
        const error = document.getElementById(`${input.id}-error`);
        input.closest('.field').classList.toggle('has-error', Boolean(message));
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
    initTheme();
    initHeader();
    initMotion();
    initVideos();
    initContactForm();
});

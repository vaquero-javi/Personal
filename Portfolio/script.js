'use strict';

/* ==========================================================================
   0. UTILIDADES
   ========================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const lerp = (a, b, t) => a + (b - a) * t;

const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduced = mqReduce.matches;
mqReduce.addEventListener?.('change', e => {
    reduced = e.matches;
    root.classList.toggle('motion', !reduced);
});
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch (e) { /* sin vibración */ } };

/* ==========================================================================
   1. MOTOR DE SPRINGS
   Parámetros al estilo Apple: "response" (segundos, rapidez) y "damping"
   (1 = sin rebote, <1 = rebota). Cada spring parte siempre de su valor y
   velocidad actuales, así que cualquier animación se puede agarrar,
   redirigir o invertir a mitad de camino sin saltos.
   ========================================================================== */
const running = new Set();
const dirty = new Set();
let rafId = 0;
let lastT = 0;

function frame(t) {
    const dt = lastT ? Math.min((t - lastT) / 1000, 1 / 20) : 1 / 60;
    lastT = t;
    for (const s of running) {
        s.step(dt);
        dirty.add(s.owner);
        if (s.resting) running.delete(s);
    }
    for (const m of dirty) m.flush();
    dirty.clear();
    if (running.size) rafId = requestAnimationFrame(frame);
    else { rafId = 0; lastT = 0; }
}
const wake = s => {
    running.add(s);
    if (!rafId) rafId = requestAnimationFrame(frame);
};

class Spring {
    constructor(value, owner, precision) {
        this.value = value;
        this.target = value;
        this.velocity = 0;
        this.owner = owner;
        this.precision = precision;
        this.resting = true;
        this.configure(0.4, 1);
    }
    configure(response, damping) {
        // Masa 1: rigidez = (2π / response)², amortiguación = 4π·damping / response
        this.k = (2 * Math.PI / response) ** 2;
        this.c = (4 * Math.PI * damping) / response;
    }
    step(dt) {
        const n = Math.max(1, Math.ceil(dt * 240));
        const h = dt / n;
        let x = this.value;
        let v = this.velocity;
        for (let i = 0; i < n; i++) {
            v += (-this.k * (x - this.target) - this.c * v) * h;
            x += v * h;
        }
        if (Math.abs(v) < this.precision * 8 && Math.abs(x - this.target) < this.precision) {
            x = this.target;
            v = 0;
            this.resting = true;
        }
        this.value = x;
        this.velocity = v;
    }
}

class Motion {
    constructor(values, render, cfg = {}) {
        this.render = render;
        this.cfg = cfg;
        this.done = null;
        this.s = {};
        for (const k in values) {
            const p = typeof cfg.precision === 'object' ? (cfg.precision[k] ?? 0.01) : (cfg.precision ?? 0.01);
            this.s[k] = new Spring(values[k], this, p);
        }
    }
    get(k) { return this.s[k].value; }
    values() {
        const o = {};
        for (const k in this.s) o[k] = this.s[k].value;
        return o;
    }
    get moving() { return Object.values(this.s).some(s => !s.resting); }

    // Anima hacia props. opts.velocity puede ser un número o {clave: px/s}
    to(props, opts = {}, done = null) {
        this.done = done;
        const response = opts.response ?? this.cfg.response ?? 0.4;
        const damping = opts.damping ?? this.cfg.damping ?? 1;
        for (const k in props) {
            const s = this.s[k];
            s.target = props[k];
            if (opts.velocity !== undefined) {
                s.velocity = typeof opts.velocity === 'object' ? (opts.velocity[k] ?? s.velocity) : opts.velocity;
            }
            s.configure(response, damping);
            if (reduced) {
                s.value = s.target;
                s.velocity = 0;
                s.resting = true;
                running.delete(s);
            } else if (s.value !== s.target || s.velocity !== 0) {
                s.resting = false;
                wake(s);
            }
        }
        if (reduced || !this.moving) this.flush();
        return this;
    }
    // Fija valores al instante (seguimiento 1:1 del dedo)
    set(props) {
        for (const k in props) {
            const s = this.s[k];
            s.value = s.target = props[k];
            s.velocity = 0;
            s.resting = true;
            running.delete(s);
        }
        this.done = null;
        this.flush();
        return this;
    }
    // Congela en el valor que se ve en pantalla (para agarrar algo en movimiento)
    stop() {
        for (const k in this.s) {
            const s = this.s[k];
            s.target = s.value;
            s.velocity = 0;
            s.resting = true;
            running.delete(s);
        }
        this.done = null;
    }
    flush() {
        this.render(this.values(), this);
        if (this.done && !this.moving) {
            const d = this.done;
            this.done = null;
            d();
        }
    }
}

/* --- Física de gestos --- */
// Proyección de inercia de Apple: dónde acabaría algo lanzado a esta velocidad
const project = (v, rate = 0.998) => ((v / 1000) * rate) / (1 - rate);
// Resistencia progresiva al pasar un límite
const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));
const rubberClamp = (x, min, max, dim) => {
    if (x < min) return min - rubber(min - x, dim);
    if (x > max) return max + rubber(x - max, dim);
    return x;
};

// Historial corto de posiciones para calcular la velocidad al soltar
class Tracker {
    constructor() { this.p = []; }
    reset() { this.p.length = 0; }
    add(x, y, t) {
        this.p.push({ x, y, t });
        while (this.p.length > 2 && t - this.p[0].t > 100) this.p.shift();
    }
    velocity(now) {
        const p = this.p;
        if (p.length < 2) return { x: 0, y: 0 };
        const a = p[0];
        const b = p[p.length - 1];
        // Si el dedo se paró antes de soltar, no hay lanzamiento
        if (now - b.t > 80) return { x: 0, y: 0 };
        const dt = (b.t - a.t) / 1000;
        if (dt <= 0) return { x: 0, y: 0 };
        return { x: clamp((b.x - a.x) / dt, -8000, 8000), y: clamp((b.y - a.y) / dt, -8000, 8000) };
    }
}

/* Arrastre con Pointer Events.
   - axis 'x' / 'y': espera ~8px para decidir la dirección; si no coincide, cede (deja hacer scroll).
   - immediate: responde en el pointer-down (para objetos que se agarran).
   Callbacks: down (agarrar, parar animación), start, move({dx, dy, t}), end({dragged, t}). */
function draggable(el, h) {
    const axis = h.axis || 'both';
    const threshold = h.threshold ?? 8;
    let s = null;
    let suppress = false;

    const begin = e => {
        s.active = true;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }
        suppress = true;
        h.start?.(e);
    };

    el.addEventListener('pointerdown', e => {
        if (s || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (h.canStart && !h.canStart(e)) return;
        suppress = false;
        s = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false };
        h.down?.(e);
        if (h.immediate) begin(e);
    });

    el.addEventListener('pointermove', e => {
        if (!s || e.pointerId !== s.id) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.active) {
            if (Math.hypot(dx, dy) < threshold) return;
            const horizontal = Math.abs(dx) > Math.abs(dy);
            if ((axis === 'x' && !horizontal) || (axis === 'y' && horizontal)) {
                s = null;
                h.end?.({ dragged: false, t: e.timeStamp });
                return;
            }
            begin(e);
        }
        h.move?.({ dx, dy, t: e.timeStamp, e });
    });

    const finish = e => {
        if (!s || e.pointerId !== s.id) return;
        const st = s;
        s = null;
        // El clic "fantasma" llega justo tras soltar; si no llega (táctil), no debe bloquear el siguiente
        if (st.active) setTimeout(() => { suppress = false; }, 80);
        h.end?.({ dragged: st.active, t: e.timeStamp, cancelled: e.type === 'pointercancel' });
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);

    // Un arrastre no debe acabar en clic
    el.addEventListener('click', e => {
        if (suppress) {
            e.preventDefault();
            e.stopPropagation();
            suppress = false;
        }
    }, true);
    el.addEventListener('dragstart', e => e.preventDefault());
}

/* --- Un solo bucle para todo lo que depende del scroll --- */
const scrollFns = [];
let scrollQueued = false;
const onScroll = fn => scrollFns.push(fn);
const runScroll = () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
        scrollQueued = false;
        scrollFns.forEach(fn => fn());
    });
};
window.addEventListener('scroll', runScroll, { passive: true });
window.addEventListener('resize', runScroll);

/* ==========================================================================
   2. TEMA (claro / oscuro) con transición suave
   ========================================================================== */
const initTheme = () => {
    const btn = $('.theme-btn');
    if (!btn) return;
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
    const current = () => root.dataset.theme || (sysDark.matches ? 'dark' : 'light');
    const sync = () => {
        const mode = current();
        btn.dataset.mode = mode;
        btn.setAttribute('aria-label', mode === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    };
    btn.addEventListener('click', () => {
        const next = current() === 'dark' ? 'light' : 'dark';
        root.classList.add('theme-anim');
        root.dataset.theme = next;
        try { localStorage.setItem('theme', next); } catch (e) { /* sin almacenamiento */ }
        sync();
        setTimeout(() => root.classList.remove('theme-anim'), 450);
    });
    sysDark.addEventListener?.('change', sync);
    sync();
};

/* ==========================================================================
   3. RELOJ DE MADRID
   ========================================================================== */
const initClock = () => {
    const clocks = $$('[data-clock]');
    const fmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
    const tick = () => clocks.forEach(el => { el.textContent = fmt.format(new Date()); });
    tick();
    setInterval(tick, 20000);
};

/* ==========================================================================
   4. ISLA DE NAVEGACIÓN: el indicador viaja con un spring entre secciones
   ========================================================================== */
const initNav = () => {
    const links = $$('[data-nav]');
    const thumb = $('.island-thumb');
    const label = $('.island-current');
    const edge = $('.edge');
    const sections = links.map(a => $(a.getAttribute('href')));
    let index = -2;

    const m = new Motion({ x: 0, w: 0, o: 0 }, ({ x, w, o }) => {
        thumb.style.transform = `translate3d(${x}px,0,0)`;
        thumb.style.width = `${w}px`;
        thumb.style.opacity = o;
    }, { response: 0.4, damping: 1, precision: { x: 0.1, w: 0.1, o: 0.002 } });

    const place = i => {
        if (i < 0) { m.to({ o: 0 }, { response: 0.3 }); return; }
        const a = links[i];
        const x = a.offsetLeft;
        const w = a.offsetWidth;
        // Si estaba oculto aparece en su sitio; si no, viaja desde donde está
        if (m.get('o') < 0.05) m.set({ x, w });
        m.to({ x, w, o: 1 });
    };

    const update = () => {
        edge?.classList.toggle('is-on', window.scrollY > 8);
        const line = window.innerHeight * 0.4;
        let i = -1;
        sections.forEach((sec, n) => { if (sec && sec.getBoundingClientRect().top <= line) i = n; });
        if (i === index) return;
        index = i;
        links.forEach((a, n) => a.setAttribute('aria-current', String(n === i)));
        if (links[0]?.offsetParent) place(i);
        if (label) {
            label.textContent = i < 0 ? 'Inicio' : links[i].textContent;
            label.classList.remove('is-swap');
            void label.offsetWidth;
            label.classList.add('is-swap');
        }
    };
    onScroll(update);
    window.addEventListener('resize', () => {
        if (index < 0 || !links[0]?.offsetParent) return;
        m.set({ x: links[index].offsetLeft, w: links[index].offsetWidth });
        m.to({ o: 1 }, { response: 0.3 });
    });
    document.fonts?.ready.then(() => { index = -2; update(); });
    update();
};

/* ==========================================================================
   5. APARICIÓN AL ENTRAR EN PANTALLA (springs críticos, sin rebote)
   ========================================================================== */
const initReveal = () => {
    const els = $$('[data-reveal]');
    if (reduced || !('IntersectionObserver' in window)) { root.classList.add('ready'); return; }

    const motions = new Map();
    els.forEach(el => {
        const materialize = el.dataset.reveal === 'materialize';
        const m = new Motion({ y: materialize ? 0 : 28, o: 0, b: materialize ? 14 : 0, s: materialize ? 0.94 : 1 }, ({ y, o, b, s }) => {
            el.style.opacity = o;
            el.style.transform = `translate3d(0,${y}px,0)${s !== 1 ? ` scale(${s})` : ''}`;
            el.style.filter = b > 0.05 ? `blur(${b}px)` : '';
        }, { precision: { y: 0.05, o: 0.002, b: 0.05, s: 0.0005 } });
        // Ninguna transición CSS debe suavizar lo que ya mueve el spring
        el.style.transition = 'none';
        m.flush();
        motions.set(el, m);
    });
    root.classList.add('ready');

    const io = new IntersectionObserver(entries => {
        const entering = entries.filter(e => e.isIntersecting).map(e => e.target);
        entering.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
        entering.forEach((el, i) => {
            io.unobserve(el);
            const m = motions.get(el);
            setTimeout(() => {
                m.to({ y: 0, o: 1, b: 0, s: 1 }, { response: 0.7, damping: 1 }, () => {
                    // Al terminar se limpian los estilos para no dejar capas ni filtros
                    el.style.transform = '';
                    el.style.filter = '';
                    el.style.opacity = '';
                    el.style.transition = '';
                });
            }, i * 70);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    els.forEach(el => io.observe(el));
};

/* --- Sobre mí: cada palabra se enciende según el scroll (seguimiento continuo) --- */
const initWords = () => {
    const el = $('[data-words]');
    if (!el) return;
    el.innerHTML = el.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
    if (reduced) return;
    const words = $$('.w', el);
    const update = () => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        if (r.bottom < 0 || r.top > vh) return;
        const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.25), 0, 1) * words.length;
        words.forEach((w, i) => { w.style.setProperty('--o', (0.2 + 0.8 * clamp(p - i, 0, 1)).toFixed(3)); });
    };
    onScroll(update);
    update();
};

/* ==========================================================================
   6. TARJETA DE PRESENTACIÓN: se arrastra 1:1, se inclina con la velocidad
   y vuelve a su sitio heredando la velocidad del lanzamiento
   ========================================================================== */
const initPass = () => {
    const pass = $('.pass');
    if (!pass) return;
    const m = new Motion({ x: 0, y: 0, r: 0, rx: 0, ry: 0, lift: 0 }, ({ x, y, r, rx, ry, lift }) => {
        pass.style.transform = `translate3d(${x}px,${y}px,0) rotate(${r}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(${1 + lift * 0.035})`;
        pass.style.setProperty('--lift', lift.toFixed(3));
    }, { precision: { x: 0.05, y: 0.05, r: 0.01, rx: 0.01, ry: 0.01, lift: 0.001 } });

    const tracker = new Tracker();
    const FREE = 70;
    let base = { x: 0, y: 0 };
    let dragging = false;

    // Libre dentro de un radio; más allá, resistencia progresiva
    const tether = v => (Math.abs(v) <= FREE ? v : Math.sign(v) * (FREE + rubber(Math.abs(v) - FREE, 260)));

    draggable(pass, {
        immediate: true,
        down: e => {
            // Agarra la tarjeta donde esté, aunque siga volviendo
            const { x, y } = m.values();
            m.set({ x, y });
            base = { x, y };
            dragging = true;
            tracker.reset();
            tracker.add(x, y, e.timeStamp);
            pass.classList.add('is-dragging');
            pass.style.setProperty('--glare', '0');
            m.to({ lift: 1, rx: 0, ry: 0 }, { response: 0.3, damping: 1 });
        },
        move: ({ dx, dy, t }) => {
            const x = tether(base.x + dx);
            const y = tether(base.y + dy);
            const prevX = m.get('x');
            m.set({ x, y });
            tracker.add(x, y, t);
            // Se inclina hacia donde va, como un objeto colgado del dedo
            const vx = (x - prevX) * 60;
            m.to({ r: clamp(vx * 0.01, -10, 10) }, { response: 0.35, damping: 0.8 });
        },
        end: ({ t }) => {
            dragging = false;
            pass.classList.remove('is-dragging');
            const v = tracker.velocity(t);
            // Hubo lanzamiento: rebote ligero; sin él, vuelta suave
            const flung = Math.hypot(v.x, v.y) > 200;
            m.to({ x: 0, y: 0 }, { velocity: v, response: 0.55, damping: flung ? 0.62 : 0.85 });
            m.to({ r: 0, lift: 0 }, { response: 0.5, damping: 0.75 });
        }
    });

    // Inclinación 3D al pasar el ratón (solo punteros finos)
    if (finePointer.matches) {
        pass.addEventListener('pointermove', e => {
            if (dragging || reduced) return;
            const r = pass.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            pass.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
            pass.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
            pass.style.setProperty('--glare', '1');
            m.to({ rx: -py * 9, ry: px * 11 }, { response: 0.5, damping: 1 });
        });
        pass.addEventListener('pointerleave', () => {
            if (dragging) return;
            pass.style.setProperty('--glare', '0');
            m.to({ rx: 0, ry: 0 }, { response: 0.6, damping: 1 });
        });
    }
};

/* ==========================================================================
   7. CARRUSEL DE PROYECTOS: arrastre 1:1, inercia proyectada, imán a la
   tarjeta más cercana al punto proyectado y rubber-band en los extremos
   ========================================================================== */
const initCarousel = () => {
    const el = $('.carousel');
    if (!el) return;
    const track = $('.carousel-track', el);
    const cards = $$('.pcard', track);
    const dots = $$('.dots button');
    const counter = $('[data-counter]');
    const prev = $('[data-prev]');
    const next = $('[data-next]');
    const n = cards.length;

    let W = 0, step = 0, offset = 0, minX = 0, maxX = 0;
    let index = 0;
    let shown = -1;
    let visible = false;

    const measure = () => {
        W = el.clientWidth;
        const cw = cards[0].offsetWidth;
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        step = cw + gap;
        offset = (W - cw) / 2;
        maxX = offset;
        minX = offset - (n - 1) * step;
    };
    const xFor = i => offset - i * step;
    const posOf = x => (offset - x) / step;

    const syncVideos = () => {
        cards.forEach((card, i) => {
            const v = $('video', card);
            const play = i === shown && visible && !reduced && !document.hidden && !root.classList.contains('sheet-active');
            if (play) {
                if (!v.src && v.dataset.src) v.src = v.dataset.src;
                v.play().catch(() => {});
            } else if (!v.paused) v.pause();
        });
    };

    const onIndex = i => {
        shown = i;
        if (counter) counter.textContent = String(i + 1).padStart(2, '0');
        dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
        if (prev) prev.disabled = i === 0;
        if (next) next.disabled = i === n - 1;
        syncVideos();
    };

    const m = new Motion({ x: 0 }, ({ x }) => {
        track.style.transform = `translate3d(${x}px,0,0)`;
        const p = posOf(x);
        cards.forEach((c, i) => c.style.setProperty('--d', Math.min(Math.abs(p - i), 1).toFixed(3)));
        // Los puntos se estiran de forma continua según la posición
        dots.forEach((d, i) => { d.style.width = `${8 + 16 * Math.max(0, 1 - Math.abs(p - i))}px`; });
        const near = clamp(Math.round(p), 0, n - 1);
        if (near !== shown) onIndex(near);
    }, { response: 0.5, damping: 1, precision: 0.1 });

    const goTo = (i, velocity = 0, flung = false) => {
        const prevIndex = index;
        index = clamp(i, 0, n - 1);
        if (flung && index !== prevIndex) haptic(6);
        m.to({ x: xFor(index) }, { velocity, response: flung ? 0.55 : 0.5, damping: flung ? 0.86 : 1 });
    };

    measure();
    m.set({ x: xFor(0) });

    const tracker = new Tracker();
    let base = 0;
    draggable(el, {
        axis: 'x',
        down: e => {
            m.stop();
            base = m.get('x');
            tracker.reset();
            tracker.add(base, 0, e.timeStamp);
        },
        start: () => el.classList.add('is-dragging'),
        move: ({ dx, t }) => {
            const x = rubberClamp(base + dx, minX, maxX, W);
            m.set({ x });
            tracker.add(x, 0, t);
        },
        end: ({ dragged, t }) => {
            el.classList.remove('is-dragging');
            const x = m.get('x');
            if (!dragged) { goTo(Math.round(posOf(x))); return; }
            const v = tracker.velocity(t).x;
            // Se elige el destino a partir de dónde iría el lanzamiento, no de dónde se soltó,
            // y como mucho una tarjeta por gesto para no saltarse proyectos
            const from = Math.round(posOf(base));
            const target = clamp(Math.round(posOf(x + project(v))), from - 1, from + 1);
            goTo(target, v, Math.abs(v) > 300);
        }
    });

    // Trackpad horizontal
    let wheelRaw = 0;
    let wheelTimer = 0;
    let wheeling = false;
    el.addEventListener('wheel', e => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault();
        if (!wheeling) {
            m.stop();
            wheelRaw = clamp(m.get('x'), minX, maxX);
            wheeling = true;
        }
        wheelRaw -= e.deltaX;
        m.set({ x: rubberClamp(wheelRaw, minX, maxX, W) });
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => {
            wheeling = false;
            goTo(Math.round(posOf(m.get('x'))));
        }, 120);
    }, { passive: false });

    // Tocar una tarjeta lateral la trae al centro; la central abre su ficha
    cards.forEach((card, i) => {
        card.addEventListener('click', e => {
            if (e.target.closest('[data-sheet-open]')) return;
            if (i !== index) goTo(i);
            else $('[data-sheet-open]', card)?.click();
        });
        // Al tabular dentro, el contenedor no debe desplazarse por su cuenta
        card.addEventListener('focusin', () => {
            el.scrollLeft = 0;
            if (i !== index) goTo(i);
        });
    });

    prev?.addEventListener('click', () => goTo(index - 1));
    next?.addEventListener('click', () => goTo(index + 1));
    dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));
    el.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
    });

    new ResizeObserver(() => {
        measure();
        m.set({ x: xFor(index) });
    }).observe(el);

    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            syncVideos();
        }, { threshold: 0.35 }).observe(el);
    }
    document.addEventListener('visibilitychange', syncVideos);
    document.addEventListener('sheetchange', syncVideos);
};

/* ==========================================================================
   8. PESTAÑAS: control segmentado + paneles que se deslizan con el dedo.
   Una sola posición continua mueve a la vez el indicador, los paneles y
   la altura, así que tocar, arrastrar el indicador o deslizar el panel se
   sienten como el mismo objeto.
   ========================================================================== */
const initTabs = tabsRoot => {
    const seg = $('.seg', tabsRoot);
    const thumb = $('.seg-thumb', seg);
    const tabs = $$('[role="tab"]', seg);
    const viewport = $('.tabs-viewport', tabsRoot);
    const track = $('.tabs-track', tabsRoot);
    const panels = $$('[role="tabpanel"]', tabsRoot);
    const n = tabs.length;
    let index = Math.max(0, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'));
    let W = 0, gap = 0, segs = [], heights = [];

    const measure = () => {
        W = viewport.clientWidth;
        gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        segs = tabs.map(t => ({ x: t.offsetLeft, w: t.offsetWidth }));
        heights = panels.map(p => p.offsetHeight);
    };

    const m = new Motion({ pos: index }, ({ pos }) => {
        track.style.transform = `translate3d(${-pos * (W + gap)}px,0,0)`;
        const i0 = n > 1 ? clamp(Math.floor(pos), 0, n - 2) : 0;
        const i1 = Math.min(i0 + 1, n - 1);
        const f = pos - i0;
        // El indicador extrapola en los bordes: así también "estira" con el rubber-band
        thumb.style.transform = `translate3d(${lerp(segs[i0].x, segs[i1].x, f)}px,0,0)`;
        thumb.style.width = `${lerp(segs[i0].w, segs[i1].w, clamp(f, 0, 1))}px`;
        viewport.style.height = `${lerp(heights[i0], heights[i1], clamp(f, 0, 1))}px`;
    }, { response: 0.42, damping: 1, precision: 0.0005 });

    const select = (i, velocity = 0, flung = false) => {
        index = clamp(i, 0, n - 1);
        tabs.forEach((t, k) => {
            t.setAttribute('aria-selected', String(k === index));
            t.tabIndex = k === index ? 0 : -1;
        });
        panels.forEach((p, k) => { p.inert = k !== index; });
        m.to({ pos: index }, { velocity, response: 0.42, damping: flung ? 0.86 : 1 });
    };

    measure();
    select(index);
    m.set({ pos: index });

    tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
    seg.addEventListener('keydown', e => {
        const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: n - 1 };
        if (!(e.key in keys)) return;
        e.preventDefault();
        select(keys[e.key]);
        tabs[index].focus();
    });

    const posRubber = (raw, unit) => {
        if (raw < 0) return -rubber(-raw * unit, unit) / unit;
        if (raw > n - 1) return n - 1 + rubber((raw - (n - 1)) * unit, unit) / unit;
        return raw;
    };

    // Deslizar el panel
    const tracker = new Tracker();
    let base = 0;
    draggable(viewport, {
        axis: 'x',
        down: e => { m.stop(); base = m.get('pos'); tracker.reset(); tracker.add(base, 0, e.timeStamp); },
        move: ({ dx, t }) => {
            const unit = W + gap;
            const pos = posRubber(base - dx / unit, unit);
            m.set({ pos });
            tracker.add(pos, 0, t);
        },
        end: ({ dragged, t }) => {
            const pos = m.get('pos');
            if (!dragged) { select(Math.round(pos)); return; }
            const unit = W + gap;
            const v = tracker.velocity(t).x; // en posiciones por segundo
            const projected = pos + project(v * unit) / unit;
            const from = Math.round(base);
            // Como un pager: como mucho una página por gesto
            const target = clamp(Math.round(projected), from - 1, from + 1);
            select(target, v, Math.abs(v * unit) > 300);
        }
    });

    // Arrastrar el indicador del control segmentado
    const thumbTracker = new Tracker();
    let thumbBase = 0;
    draggable(seg, {
        axis: 'x',
        threshold: 4,
        canStart: e => e.target.closest('[role="tab"]') === tabs[index],
        down: e => { m.stop(); thumbBase = m.get('pos'); thumbTracker.reset(); thumbTracker.add(thumbBase, 0, e.timeStamp); },
        move: ({ dx, t }) => {
            const unit = segs.reduce((a, s) => a + s.w, 0) / n;
            const pos = posRubber(thumbBase + dx / unit, unit);
            m.set({ pos });
            thumbTracker.add(pos, 0, t);
        },
        end: ({ dragged, t }) => {
            const pos = m.get('pos');
            if (!dragged) { select(Math.round(pos)); return; }
            const v = thumbTracker.velocity(t).x;
            select(Math.round(pos + v * 0.08), v, false);
        }
    });

    // Se observan los paneles (no el visor, cuya altura cambia en cada frame)
    const remeasure = () => { measure(); m.flush(); };
    const ro = new ResizeObserver(remeasure);
    panels.forEach(p => ro.observe(p));
    document.fonts?.ready.then(remeasure);
};

/* ==========================================================================
   8b. TECLADO DE HABILIDADES: cada tecla se hunde al instante al pulsarla
   (pointer-down) y rebota al soltarla; la información cambia con un spring.
   También responde al teclado físico (inicial de cada tecnología).
   ========================================================================== */
const initKeyboard = () => {
    const stage = $('.kb-stage');
    if (!stage) return;
    const kb = $('.kb', stage);
    const plate = $('.kb-plate', kb);
    const keys = $$('.key', kb);
    const info = $('.skill-info-inner');
    const [cat, name, text] = [...info.children];

    // Volumen: capas apiladas en Z para la base y para cada tecla
    for (let i = 1; i <= 6; i++) {
        const l = document.createElement('i');
        l.style.setProperty('--i', i);
        plate.append(l);
    }
    keys.forEach(key => {
        const label = key.textContent.trim();
        key.dataset.name = label;
        key.setAttribute('aria-label', label);
        key.textContent = '';
        for (let i = 1; i <= 5; i++) {
            const l = document.createElement('span');
            l.className = 'key-layer';
            l.style.setProperty('--i', i);
            key.append(l);
        }
        const cap = document.createElement('span');
        cap.className = 'key-cap';
        const mark = document.createElement('span');
        if (key.dataset.logo) {
            mark.className = 'key-logo';
            mark.style.setProperty('--logo', `url("assets/logos/${key.dataset.logo}.svg")`);
        } else {
            mark.className = 'key-legend';
            mark.textContent = key.dataset.legend || '';
        }
        cap.append(mark);
        key.append(cap);
        key.motion = new Motion({ z: 0 }, ({ z }) => key.style.setProperty('--z', z.toFixed(2)), { precision: 0.02 });
    });

    // Panel de información: sale y entra con un spring, interrumpible si cambias rápido
    const infoM = new Motion({ y: 0, o: 1 }, ({ y, o }) => {
        info.style.transform = y ? `translate3d(0,${y}px,0)` : '';
        info.style.opacity = o;
    }, { precision: { y: 0.05, o: 0.002 } });
    let active = null;
    const select = key => {
        if (key === active) return;
        active?.classList.remove('is-active');
        active = key;
        key.classList.add('is-active');
        cat.textContent = key.dataset.cat;
        name.textContent = key.dataset.name;
        text.textContent = key.dataset.text;
        infoM.set({ y: 10, o: 0 });
        infoM.to({ y: 0, o: 1 }, { response: 0.35, damping: 1 });
    };

    // Física de cada tecla
    let hovered = null;
    const press = key => {
        key.motion.to({ z: -9 }, { response: 0.1, damping: 1 });
        select(key);
        haptic(5);
    };
    const release = key => key.motion.to({ z: key === hovered ? 3 : 0 }, { response: 0.36, damping: 0.42 });
    const tap = key => {
        press(key);
        setTimeout(() => release(key), 90);
    };

    keys.forEach(key => {
        key.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            press(key);
        });
        key.addEventListener('pointerup', () => release(key));
        key.addEventListener('pointercancel', () => release(key));
        key.addEventListener('pointerenter', e => {
            if (e.pointerType !== 'mouse') return;
            hovered = key;
            select(key);
            key.motion.to({ z: 3 }, { response: 0.25, damping: 1 });
        });
        key.addEventListener('pointerleave', () => {
            if (hovered === key) hovered = null;
            key.motion.to({ z: 0 }, { response: 0.36, damping: 0.6 });
        });
        key.addEventListener('focus', () => select(key));
        // Enter / Espacio con el foco en la tecla
        key.addEventListener('click', e => { if (e.detail === 0) tap(key); });
    });

    // Teclado físico: la inicial pulsa esa tecnología; repetirla recorre las que coinciden
    let visible = false;
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.3 }).observe(stage);
    }
    const down = new Map();
    document.addEventListener('keydown', e => {
        if (!visible || e.repeat || e.metaKey || e.ctrlKey || e.altKey || sheet.isOpen()) return;
        if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
        const letter = e.key.length === 1 ? e.key.toLowerCase() : '';
        if (!/[a-zñ]/.test(letter)) return;
        const matches = keys.filter(k => k.dataset.name.toLowerCase().startsWith(letter));
        if (!matches.length) return;
        const next = matches[(matches.indexOf(active) + 1) % matches.length];
        down.set(e.code, next);
        press(next);
    });
    document.addEventListener('keyup', e => {
        const key = down.get(e.code);
        if (!key) return;
        down.delete(e.code);
        release(key);
    });

    // El teclado se inclina un poco hacia el puntero
    if (finePointer.matches) {
        const tilt = new Motion({ rx: 50, rz: -36 }, ({ rx, rz }) => {
            kb.style.transform = `rotateX(${rx}deg) rotateZ(${rz}deg)`;
        }, { precision: 0.01 });
        stage.addEventListener('pointermove', e => {
            if (reduced) return;
            const r = stage.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            tilt.to({ rx: 50 - py * 8, rz: -36 + px * 8 }, { response: 0.8, damping: 1 });
        });
        stage.addEventListener('pointerleave', () => tilt.to({ rx: 50, rz: -36 }, { response: 0.9, damping: 1 }));
    }
};

/* ==========================================================================
   9. TOAST: entra con un spring y se descarta deslizándolo hacia abajo
   ========================================================================== */
const toast = (() => {
    const el = $('.toast');
    if (!el) return { show: () => {} };
    const text = $('.toast-text', el);
    const OFF = 140;
    let timer = 0;
    const m = new Motion({ y: OFF, s: 0.9, o: 0 }, ({ y, s, o }) => {
        el.style.transform = `translate3d(0,${y}px,0) scale(${s})`;
        el.style.opacity = o;
    }, { precision: { y: 0.1, s: 0.0005, o: 0.002 } });

    const hide = (velocity = 0) => {
        clearTimeout(timer);
        if (reduced) m.to({ o: 0 });
        else m.to({ y: OFF, s: 0.9 }, { velocity: { y: velocity }, response: 0.4, damping: 1 });
    };
    const icon = $('i', el);
    const show = (msg, type = 'success') => {
        text.textContent = msg;
        el.classList.toggle('is-error', type === 'error');
        icon.className = `ti ${type === 'error' ? 'ti-alert-circle-filled' : 'ti-circle-check-filled'}`;
        clearTimeout(timer);
        if (reduced) m.set({ y: 0, s: 1 });
        m.to({ y: 0, s: 1, o: 1 }, { response: 0.42, damping: 0.8 });
        timer = setTimeout(hide, 2600);
    };

    const tracker = new Tracker();
    let base = 0;
    draggable(el, {
        axis: 'y',
        threshold: 4,
        down: e => { clearTimeout(timer); m.stop(); base = m.get('y'); tracker.reset(); tracker.add(0, base, e.timeStamp); },
        move: ({ dy, t }) => {
            const raw = base + dy;
            const y = raw < 0 ? -rubber(-raw, 80) : raw;
            m.set({ y });
            tracker.add(0, y, t);
        },
        end: ({ dragged, t }) => {
            const v = tracker.velocity(t).y;
            if (dragged && (v > 200 || m.get('y') > 32)) hide(v);
            else { m.to({ y: 0 }, { velocity: { y: v }, response: 0.35, damping: 0.8 }); timer = setTimeout(hide, 2000); }
        }
    });
    return { show };
})();

/* ==========================================================================
   10. SHEET: sube desde abajo, la página retrocede y se oscurece; se cierra
   arrastrando (con proyección de la velocidad), con Esc o tocando fuera.
   Se puede agarrar a mitad de apertura o de cierre.
   ========================================================================== */
const sheet = (() => {
    const el = $('.sheet');
    const scrim = $('.scrim');
    const page = $('#page');
    const island = $('#island');
    if (!el) return { open: () => {}, close: () => {}, isOpen: () => false };
    const head = $('.sheet-head', el);
    const body = $('.sheet-body', el);
    const title = $('#sheet-title');
    const contents = $$('[data-sheet]', el);

    let H = window.innerHeight;
    let isOpen = false;
    let trigger = null;
    let key = null;
    let afterClose = null;

    const pushScale = () => (reduced ? 0 : window.innerWidth < 700 ? 0.06 : 0.035);
    let push = pushScale();

    const m = new Motion({ y: H }, ({ y }) => {
        const p = clamp(1 - y / H, 0, 1);
        el.style.transform = `translate3d(0,${y}px,0)`;
        scrim.style.opacity = p;
        page.style.transform = p > 0.001 && push ? `scale(${1 - push * p})` : '';
    }, { precision: 0.2 });

    const measure = () => {
        const bottom = parseFloat(getComputedStyle(el).bottom) || 0;
        H = el.offsetHeight + bottom + 24;
    };

    const setModal = on => {
        page.inert = on;
        if (island) island.inert = on;
    };

    const finishClose = () => {
        if (isOpen) return;
        el.hidden = true;
        root.classList.remove('sheet-active');
        root.style.overflow = '';
        page.style.transform = '';
        page.style.transformOrigin = '';
        document.dispatchEvent(new Event('sheetchange'));
        const cb = afterClose;
        afterClose = null;
        cb?.();
    };

    const open = (name, from) => {
        const content = contents.find(c => c.dataset.sheet === name);
        if (!content) return;
        const wasHidden = el.hidden;
        if (name !== key) {
            contents.forEach(c => { c.hidden = c !== content; });
            title.textContent = content.dataset.title || '';
            key = name;
            body.scrollTop = 0;
        }
        trigger = from || document.activeElement;
        isOpen = true;
        afterClose = null;
        push = pushScale();
        if (wasHidden) page.style.transformOrigin = `50% ${window.scrollY + window.innerHeight / 2}px`;
        root.classList.add('sheet-active');
        root.style.overflow = 'hidden';
        el.hidden = false;
        measure();
        // Si venía cerrándose, sigue desde donde está (interrumpible)
        if (wasHidden) m.set({ y: H });
        setModal(true);
        document.dispatchEvent(new Event('sheetchange'));
        if (reduced) el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' });
        m.to({ y: 0 }, { response: 0.45, damping: 1 });
        $('.sheet-close', el).focus({ preventScroll: true });
    };

    const close = (velocity = 0, then = null) => {
        if (el.hidden) { then?.(); return; }
        isOpen = false;
        afterClose = then;
        setModal(false);
        $$('video', el).forEach(v => v.pause());
        trigger?.focus?.({ preventScroll: true });
        if (reduced) {
            const a = el.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease' });
            const go = () => m.to({ y: H }, {}, finishClose);
            if (a) a.onfinish = go; else go();
            return;
        }
        m.to({ y: H }, { velocity, response: 0.4, damping: 1 }, finishClose);
    };

    // --- Arrastre compartido por la cabecera (puntero) y el contenido (táctil) ---
    const tracker = new Tracker();
    let base = 0;
    const grab = t => {
        m.stop();
        base = m.get('y');
        tracker.reset();
        tracker.add(0, base, t);
    };
    const follow = (dy, t) => {
        if (el.hidden) return;
        if (!isOpen) { isOpen = true; afterClose = null; setModal(true); }
        const raw = base + dy;
        // Hacia arriba no hay más recorrido: resiste
        const y = raw < 0 ? -rubber(-raw, H * 0.5) : raw;
        m.set({ y });
        tracker.add(0, y, t);
    };
    const release = t => {
        const v = tracker.velocity(t).y;
        const y = m.get('y');
        // Con velocidad clara manda su sentido; si no, dónde acabaría por inercia
        const dismiss = Math.abs(v) > 500 ? v > 0 : y + project(v) > H * 0.4;
        if (dismiss) { haptic(6); close(v); }
        else m.to({ y: 0 }, { velocity: v, response: 0.38, damping: 0.82 });
    };

    draggable(head, {
        axis: 'y',
        threshold: 4,
        down: e => grab(e.timeStamp),
        move: ({ dy, t }) => follow(dy, t),
        end: ({ dragged, t }) => {
            if (dragged) release(t);
            else if (isOpen) m.to({ y: 0 }, { response: 0.45, damping: 1 });
            else close();
        }
    });

    // En táctil, tirar hacia abajo del contenido cuando ya está arriba del todo también cierra
    let touch = null;
    body.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { touch = null; return; }
        touch = { y: e.touches[0].clientY, atTop: body.scrollTop <= 0, dragging: false };
    }, { passive: true });
    body.addEventListener('touchmove', e => {
        if (!touch) return;
        const y = e.touches[0].clientY;
        const dy = y - touch.y;
        if (!touch.dragging) {
            if (!touch.atTop || body.scrollTop > 0 || dy < 0) { touch = null; return; }
            if (!e.cancelable) { touch = null; return; }
            e.preventDefault();
            if (dy < 6) return;
            touch.dragging = true;
            touch.y = y;
            grab(e.timeStamp);
            return;
        }
        e.preventDefault();
        follow(dy, e.timeStamp);
    }, { passive: false });
    const touchEnd = e => {
        if (touch?.dragging) release(e.timeStamp);
        touch = null;
    };
    body.addEventListener('touchend', touchEnd);
    body.addEventListener('touchcancel', touchEnd);

    scrim.addEventListener('click', () => close());
    $('.sheet-close', el).addEventListener('click', () => close());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) close(); });
    window.addEventListener('resize', () => { if (!el.hidden) { measure(); if (!isOpen) m.to({ y: H }); } });

    document.addEventListener('click', e => {
        const btn = e.target.closest('[data-sheet-open]');
        if (!btn) return;
        e.preventDefault();
        open(btn.dataset.sheetOpen, btn);
    });

    return { open, close, isOpen: () => isOpen };
})();

/* ==========================================================================
   11. ANCLAS: si hay un sheet abierto, primero se cierra y luego se desplaza
   ========================================================================== */
const initAnchors = () => {
    document.addEventListener('click', e => {
        const a = e.target.closest('a[href^="#"]');
        if (!a) return;
        const hash = a.getAttribute('href');
        if (hash.length < 2) return;
        const target = hash === '#inicio' ? null : $(hash);
        if (hash !== '#inicio' && !target) return;
        e.preventDefault();
        const go = () => {
            const behavior = reduced ? 'auto' : 'smooth';
            if (target) target.scrollIntoView({ behavior, block: 'start' });
            else window.scrollTo({ top: 0, behavior });
            history.replaceState(null, '', hash);
        };
        if (sheet.isOpen()) sheet.close(0, go);
        else go();
    });
};

/* ==========================================================================
   12. COPIAR CORREO
   ========================================================================== */
const initCopy = () => {
    $$('[data-copy]').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(btn.dataset.copy);
                haptic(10);
                toast.show('Correo copiado');
            } catch (e) {
                toast.show('No se pudo copiar', 'error');
            }
        });
    });
};

/* ==========================================================================
   13. FORMULARIO (Formspree): validación en línea y "sacudida" con spring
   ========================================================================== */
const initContactForm = () => {
    const form = $('#contact-form');
    if (!form) return;
    const submitBtn = $('#form-btn');
    const status = $('.form-status', form);
    const btnLabel = submitBtn.innerHTML;

    // Un spring con velocidad inicial y poca amortiguación oscila y se calma solo
    const shakers = new Map();
    const shake = field => {
        let m = shakers.get(field);
        if (!m) {
            const input = $('input, textarea', field);
            m = new Motion({ x: 0 }, ({ x }) => { input.style.transform = x ? `translate3d(${x}px,0,0)` : ''; }, { precision: 0.05 });
            shakers.set(field, m);
        }
        m.to({ x: 0 }, { velocity: 900, response: 0.25, damping: 0.22 });
    };

    const setFieldError = (input, message) => {
        const error = $(`#${input.id}-error`);
        const field = input.closest('.field');
        field.classList.toggle('has-error', Boolean(message));
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
        if (message) input.setAttribute('aria-describedby', error.id);
        else input.removeAttribute('aria-describedby');
        error.textContent = message;
    };

    const validate = () => {
        let firstInvalid = null;
        $$('[required]', form).forEach(input => {
            let message = '';
            if (!input.value.trim()) message = 'Este campo es obligatorio.';
            else if (input.type === 'email' && !input.validity.valid) message = 'Introduce un correo válido.';
            setFieldError(input, message);
            if (message) {
                shake(input.closest('.field'));
                if (!firstInvalid) firstInvalid = input;
            }
        });
        if (firstInvalid) haptic([8, 40, 8]);
        firstInvalid?.focus();
        return !firstInvalid;
    };

    $$('[required]', form).forEach(input => {
        input.addEventListener('input', () => {
            if (input.closest('.field').classList.contains('has-error')) setFieldError(input, '');
        });
        input.addEventListener('blur', () => {
            if (input.type === 'email' && input.value.trim() && !input.validity.valid) setFieldError(input, 'Introduce un correo válido.');
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
        submitBtn.textContent = 'Enviando…';
        try {
            const response = await fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: { Accept: 'application/json' }
            });
            if (response.ok) {
                form.reset();
                setStatus('');
                haptic(12);
                sheet.close(0, () => toast.show('Mensaje enviado. ¡Gracias!'));
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

/* ==========================================================================
   ARRANQUE
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // En iOS, :active solo responde al instante si hay un listener táctil
    document.addEventListener('touchstart', () => {}, { passive: true });
    initTheme();
    initClock();
    initWords();
    initReveal();
    initNav();
    initPass();
    initCarousel();
    $$('[data-tabs]').forEach(initTabs);
    initKeyboard();
    initAnchors();
    initCopy();
    initContactForm();
});

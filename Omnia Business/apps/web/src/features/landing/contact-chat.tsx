'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCheck, RotateCcw, SendHorizontal } from 'lucide-react';
import { Logo } from './shared';

type Msg = { id: number; from: 'tu' | 'omnia'; text: string; time: string };
type Step = 'nombre' | 'correo' | 'duda' | 'dia' | 'fin';
export type ContactRequest = { nombre: string; correo: string; duda: string; dia: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Lo que tarda el asistente en «escribir» cada mensaje (ms). */
const TYPING = 900;

const FIELD: Record<Exclude<Step, 'fin'>, { label: string; placeholder: string; type: string; autoComplete: string; inputMode?: 'email' }> = {
  nombre: { label: 'Tu nombre', placeholder: 'Escribe tu nombre', type: 'text', autoComplete: 'name' },
  correo: { label: 'Tu correo', placeholder: 'tucorreo@empresa.com', type: 'email', autoComplete: 'email', inputMode: 'email' },
  duda: { label: 'Tu duda', placeholder: 'Escribe tu duda', type: 'text', autoComplete: 'off' },
  dia: { label: 'Día para la reunión', placeholder: 'Elige un día o escríbelo', type: 'text', autoComplete: 'off' },
};

/** Formulario de Formspree que reenvía cada petición al correo del equipo (p. ej. «xyzabcd»). */
const FORMSPREE_ID = process.env.NEXT_PUBLIC_FORMSPREE_ID;

/** Envía la petición de contacto al equipo por Formspree. Devuelve si se ha enviado. */
async function sendContactRequest(req: ContactRequest) {
  if (!FORMSPREE_ID) {
    console.warn('Falta NEXT_PUBLIC_FORMSPREE_ID: la petición de contacto no se ha enviado.');
    return false;
  }
  try {
    const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: `Nueva solicitud de reunión: ${req.nombre}`,
        nombre: req.nombre,
        email: req.correo,
        duda: req.duda,
        dia_reunion: req.dia,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const now = () => new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** Los próximos cinco días laborables, para elegir con un toque. */
function nextWorkdays() {
  const out: string[] = [];
  const d = new Date();
  while (out.length < 5) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const s = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '');
    out.push(s.charAt(0).toUpperCase() + s.slice(1));
  }
  return out;
}

/** Asistente de contacto con forma de chat: pide nombre, correo, duda y día para una reunión. */
export function ContactChat() {
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const touched = useRef(false);
  const queue = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [started, setStarted] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [step, setStep] = useState<Step>('nombre');
  const [value, setValue] = useState('');
  const [data, setData] = useState<Partial<ContactRequest>>({});
  const [days, setDays] = useState<string[]>([]);

  const push = (from: Msg['from'], text: string) => setMsgs((m) => [...m, { id: nextId.current++, from, text, time: now() }]);

  /** El asistente escribe sus mensajes en orden, con «escribiendo…» antes de cada uno. */
  const say = (texts: string[], then?: () => void) => {
    const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let t = 0;
    texts.forEach((text, i) => {
      queue.current.push(setTimeout(() => setTyping(true), t));
      t += quick ? 0 : TYPING;
      queue.current.push(
        setTimeout(() => {
          setTyping(false);
          push('omnia', text);
          if (i === texts.length - 1) {
            then?.();
            if (touched.current) input.current?.focus({ preventScroll: true });
          }
        }, t),
      );
      t += quick ? 0 : 250;
    });
  };

  const start = () => {
    queue.current.forEach(clearTimeout);
    queue.current = [];
    setMsgs([]);
    setData({});
    setValue('');
    setStep('nombre');
    say(['¡Hola! 👋 Soy el asistente de Omnia.', 'Te ayudo a preparar una reunión con nuestro equipo. ¿Cómo te llamas?']);
  };

  // Saluda cuando el chat entra en pantalla.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setDays(nextWorkdays());
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      queue.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (started) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Mantiene a la vista el último mensaje sin mover la página.
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [msgs, typing]);

  const answer = (raw: string) => {
    const text = raw.trim();
    if (!text || typing || step === 'fin') return;
    touched.current = true;
    push('tu', text);
    setValue('');

    if (step === 'nombre') {
      const nombre = text.split(/\s+/)[0]!;
      setData((d) => ({ ...d, nombre: text }));
      setStep('correo');
      say([`Un placer, ${nombre}. ¿A qué correo te escribimos para responderte?`]);
    } else if (step === 'correo') {
      if (!EMAIL.test(text)) return say(['Ese correo no parece correcto. ¿Puedes revisarlo?']);
      setData((d) => ({ ...d, correo: text }));
      setStep('duda');
      say(['Perfecto. ¿Qué duda tienes o qué te gustaría ver de Omnia?']);
    } else if (step === 'duda') {
      setData((d) => ({ ...d, duda: text }));
      setStep('dia');
      say(['Apuntado. ¿Qué día te viene bien para una reunión por videollamada? Puedes elegir uno o escribirlo.']);
    } else if (step === 'dia') {
      const req = { ...data, dia: text } as ContactRequest;
      setData(req);
      setTyping(true); // mientras se envía, «escribiendo…» y la caja bloqueada
      void sendContactRequest(req).then((ok) => {
        if (!ok) return say(['Vaya, no hemos podido enviar tu mensaje. Vuelve a elegir el día para intentarlo de nuevo.']);
        setStep('fin');
        say([
          `¡Gracias, ${req.nombre.split(/\s+/)[0]}! Ya tenemos tu mensaje.`,
          `El equipo de Omnia lo revisará y te responderá a ${req.correo} en menos de 24 horas para confirmar la reunión.`,
        ]);
      });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    answer(value);
  };

  const field = step === 'fin' ? null : FIELD[step];
  const showDays = step === 'dia' && !typing;

  return (
    <div ref={box} className="ln-chat flex flex-col">
      <div className="ln-chat-head flex items-center gap-3 px-4 py-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--sheet-ink)] text-white">
          <Logo className="h-4 w-auto" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[16px] font-semibold">Equipo Omnia</p>
          <p className="text-[13px] opacity-80">{typing ? 'escribiendo…' : 'en línea'}</p>
        </div>
        {msgs.length > 2 && (
          <button
            type="button"
            onClick={start}
            className="flex h-8 items-center gap-1.5 rounded-full bg-black/25 px-3 text-[13px] font-medium text-white transition-[background-color,scale] duration-150 hover:bg-black/35 active:scale-[0.97]"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            <span className="max-sm:sr-only">Empezar de nuevo</span>
          </button>
        )}
      </div>

      <div ref={body} role="log" aria-live="polite" aria-label="Conversación con el equipo de Omnia" className="ln-chat-body flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4">
        <div className="flex-1" />
        {msgs.map((m) => (
          <div key={m.id} className={`ln-bubble ln-swap ${m.from === 'tu' ? 'ln-bubble-out' : 'ln-bubble-in'}`}>
            <span className="sr-only">{m.from === 'tu' ? 'Tú: ' : 'Omnia: '}</span>
            <span className="break-words whitespace-pre-wrap">{m.text}</span>
            <span aria-hidden className="ln-bubble-meta">
              {m.time}
              {m.from === 'tu' && <CheckCheck className="size-4 text-[#53bdeb]" strokeWidth={2.2} />}
            </span>
          </div>
        ))}
        {typing && (
          <div aria-hidden className="ln-bubble ln-bubble-in ln-swap">
            <span className="ln-dots">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {showDays && (
          <div className="ln-swap mt-1 flex flex-wrap justify-end gap-1.5">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => answer(d)}
                className="h-9 rounded-full border border-[#00a884]/40 bg-white px-3.5 text-[14px] font-medium text-[#008069] transition-[background-color,scale] duration-150 hover:bg-[#e7f8f2] active:scale-[0.97]"
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      <form noValidate onSubmit={onSubmit} className="ln-chat-foot flex items-center gap-2 px-3 py-2.5">
        <label htmlFor="ln-chat-input" className="sr-only">
          {field?.label ?? 'Conversación terminada'}
        </label>
        <input
          ref={input}
          id="ln-chat-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!field || !started}
          type={field?.type ?? 'text'}
          inputMode={field?.inputMode}
          autoComplete={field?.autoComplete}
          maxLength={step === 'duda' ? 600 : 120}
          placeholder={field ? field.placeholder : 'Mensaje enviado'}
          className="h-10 min-w-0 flex-1 rounded-full bg-white px-4 text-[16px] text-[#111b21] outline-none placeholder:text-[#8696a0] focus-visible:ring-2 focus-visible:ring-[#00a884]/50 disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={!field || !value.trim() || typing}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition-[background-color,scale,opacity] duration-150 hover:bg-[#008f72] active:scale-[0.94] disabled:opacity-50"
        >
          <SendHorizontal className="size-[18px]" />
        </button>
      </form>
    </div>
  );
}

import Link from 'next/link';
import { Bodoni_Moda } from 'next/font/google';
import { Hero } from './hero';
import { MacStory } from './mac';
import { ModuleSheet } from './sheet';
import { CustomWork } from './custom';
import { OneDay } from './day';
import { Plans } from './plans';
import { FloatingCta } from './float-cta';
import { ContactChat } from './contact-chat';
import { RevealRoot } from './reveal';
import { BUY_HREF, ENTER_HREF, Logo, TRIAL_HREF } from './shared';
import './landing.css';

const serif = Bodoni_Moda({ subsets: ['latin'], variable: '--ln-serif', display: 'swap' });

const FAQ = [
  ['¿Tengo que instalar algo?', 'No. Omnia funciona en el navegador del ordenador, la tablet o el móvil, y si quieres la instalas como una app más desde el propio navegador.'],
  ['¿Cumple con VeriFactu?', 'Sí. Cada factura y cada ticket se registran encadenados con la huella del anterior y llevan el código QR tributario.'],
  ['¿Puedo llevar varias empresas?', 'Sí. Con una sola cuenta gestionas todas tus sociedades, cambias de una a otra con un clic y tienes una vista conjunta del grupo.'],
  ['¿Quién ve qué dentro de la empresa?', 'Lo decides tú con roles: qué puede hacer cada uno, desde cobrar hasta ver los turnos de todo el equipo o consultar las cifras.'],
  ['¿Mis empleados pueden fichar desde el móvil?', 'Sí, con la ubicación si la empresa lo pide. También pueden fichar con su tarjeta de empleado en el TPV.'],
  ['¿Y si necesito algo que Omnia no tiene?', 'Cuéntanoslo. Si tu empresa necesita algo concreto, nuestro equipo lo desarrolla y lo añade a tu app, sin que tengas que cambiar de programa.'],
  ['¿Mis datos están separados de los de otras empresas?', 'Sí. La separación entre empresas la impone la propia base de datos, no solo la aplicación.'],
] as const;

/** Página de inicio pública de Omnia. */
export function Landing() {
  return (
    <div className={serif.variable}>
      <RevealRoot>
        <main>
          <Hero />

          <section aria-labelledby="ln-one" className="ln-wrap pt-[clamp(80px,10vw,160px)]">
            <div className="ln-chapter">
              <span>Sobre Omnia</span>
              <span>Capítulo 01</span>
            </div>
            <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
              <h2 id="ln-one" data-reveal className="ln-serif text-[clamp(48px,8.4vw,150px)]">
                Una sola app. Para todo.
              </h2>
              <div>
                <p data-reveal style={{ '--i': 1 } as React.CSSProperties} className="max-w-[44ch] text-[18px] leading-[1.55] text-[var(--ink-2)]">
                  Ventas, facturas con VeriFactu, compras, almacén, fichajes, turnos, vacaciones, nóminas, tareas y cifras. Lo que hoy tienes repartido entre hojas de cálculo, programas sueltos y mensajes, en un único sitio que funciona en el ordenador, la tablet y el móvil.
                </p>
                <div data-reveal style={{ '--i': 2 } as React.CSSProperties} className="mt-8 flex flex-wrap gap-2">
                  <Link href={TRIAL_HREF} className="ln-pill">
                    Prueba gratis un mes
                  </Link>
                  <Link href={BUY_HREF} className="ln-pill ln-pill-ghost">
                    Contratar
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-[clamp(80px,10vw,160px)]">
            <MacStory />
          </div>

          <ModuleSheet />

          <CustomWork />

          <OneDay />

          <Plans />

          <section aria-labelledby="ln-faq" className="ln-wrap ln-faq pt-[clamp(96px,12vw,200px)]">
            <div className="ln-chapter">
              <span>Preguntas</span>
              <span>Capítulo 07</span>
            </div>
            <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <h2 id="ln-faq" className="ln-serif text-[clamp(48px,7vw,124px)] lg:sticky lg:top-8 lg:self-start">
                Lo que nos preguntan.
              </h2>
              <div>
                {FAQ.map(([q, a]) => (
                  <details key={q} name="ln-faq" className="group">
                    <summary className="flex cursor-pointer items-center justify-between gap-6 py-6 text-[clamp(19px,1.6vw,22px)] font-semibold tracking-[-0.01em]">
                      {q}
                      <span aria-hidden className="ln-plus" />
                    </summary>
                    <p className="max-w-[56ch] pb-7 text-[17px] leading-[1.55] text-[var(--ink-2)]">{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          <section id="empieza" aria-labelledby="ln-end" className="ln-wrap flex min-h-[90svh] flex-col items-center justify-center pt-[clamp(96px,12vw,200px)] text-center">
            <h2 id="ln-end" data-reveal className="ln-serif text-[clamp(56px,12vw,220px)]">
              Empieza hoy
            </h2>
            <p data-reveal style={{ '--i': 1 } as React.CSSProperties} className="mt-6 max-w-[40ch] text-[18px] leading-[1.5] text-[var(--ink-2)]">
              Un mes gratis con todos los módulos. Si te convence, lo contratas y sigues con todo lo que ya tienes dentro.
            </p>
            <div data-reveal style={{ '--i': 2 } as React.CSSProperties} className="mt-10 flex flex-wrap justify-center gap-2">
              <Link href={TRIAL_HREF} className="ln-pill">
                Prueba gratis un mes
              </Link>
              <Link href={BUY_HREF} className="ln-pill ln-pill-ghost">
                Contratar
              </Link>
            </div>
          </section>

          <section id="contacto" aria-labelledby="ln-contact" className="ln-wrap mt-[clamp(64px,8vw,120px)]">
            <div className="ln-contact grid gap-10 rounded-[clamp(24px,2.4vw,36px)] p-[clamp(24px,4vw,64px)] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
              <div>
                <p data-reveal className="text-[15px] font-semibold">Contacto</p>
                <h2 id="ln-contact" data-reveal style={{ '--i': 1 } as React.CSSProperties} className="ln-serif mt-4 text-[clamp(48px,7.4vw,128px)] !leading-[1.1]">
                  ¿Tienes dudas? Hablemos.
                </h2>
              </div>
              <div data-reveal style={{ '--i': 2 } as React.CSSProperties}>
                <ContactChat />
              </div>
            </div>
          </section>
        </main>

        <footer className="ln-wrap mt-24 grid grid-cols-1 items-end gap-6 pb-8 text-[15px] sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span>Omnia</span>
            <span className="text-[var(--ink-2)]">Gestión de empresas</span>
          </div>
          <div className="flex flex-col items-center gap-2 text-[var(--ink-3)] max-sm:items-start">
            <Logo className="h-8 w-auto text-[var(--ink-3)]" />
            <span>© 2026 Omnia</span>
          </div>
          <nav aria-label="Pie" className="flex flex-col gap-1 sm:items-end">
            <a href="#precios" className="hover:text-[var(--pill)]">Precios</a>
            <a href="#contacto" className="hover:text-[var(--pill)]">Contacto</a>
            <Link href={ENTER_HREF} className="hover:text-[var(--pill)]">Entrar</Link>
          </nav>
        </footer>

        <FloatingCta />
      </RevealRoot>
    </div>
  );
}

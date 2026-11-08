import { redirect } from 'next/navigation';
import { currentTerminal } from '@/server/session';
import { PairForm } from '@/features/pair-form';
import { BrandLoop } from '@/components/brand-loop';

export const metadata = { title: 'Vincular terminal · Omnia TPV' };

export default async function PairPage() {
  if (await currentTerminal()) redirect('/');
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden p-4">
      {/* De fondo, la animación de la pantalla de carga en vectorial: los aros asoman por los lados de la tarjeta. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden bg-carton">
        <BrandLoop className="w-[min(80vw,128vh)] shrink-0 opacity-90" />
      </div>
      <div className="material w-full max-w-md rounded-[24px] shadow-[var(--shadow-float)]">
        <div className="px-6 pt-6 pb-1 text-center">
          <p className="text-[13px] font-semibold text-ink-3 uppercase">Omnia TPV</p>
          <h1 className="mt-1 text-[24px] font-bold tracking-[-0.02em]">Vincular este terminal</h1>
          <p className="mt-2 text-[15px] text-ink-2">
            En el backoffice, un encargado entra en <b>Ajustes › TPV</b>, crea el terminal (o pulsa «Nuevo código») y te dicta el código de 8 caracteres.
          </p>
        </div>
        <PairForm />
      </div>
    </main>
  );
}

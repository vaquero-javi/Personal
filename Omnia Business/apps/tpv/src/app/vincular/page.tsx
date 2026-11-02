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
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden bg-white">
        <BrandLoop className="w-[min(80vw,128vh)] shrink-0" />
      </div>
      <div className="w-full max-w-md rounded-xl border border-shelf-edge bg-sheet">
        <div className="border-b border-line px-6 py-5">
          <p className="text-xs font-semibold text-ink-3">Omnia TPV</p>
          <h1 className="mt-1 text-xl font-bold">Vincular este terminal</h1>
          <p className="mt-2 text-sm text-ink-2">
            En el backoffice, un encargado entra en <b>Ajustes › TPV</b>, crea el terminal (o pulsa «Nuevo código») y te dicta el código de 8 caracteres.
          </p>
        </div>
        <PairForm />
      </div>
    </main>
  );
}

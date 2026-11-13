import { EyeOff } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';

/**
 * Lo que se ve al llegar (por un enlace guardado o una pestaña abierta) a un
 * módulo que Omnia oculta a la sociedad. A diferencia de ModuleLocked, no dice
 * qué módulo es ni ofrece pedirlo: para la sociedad no existe.
 */
export function ModuleUnavailable({ home }: { home: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
      <EyeOff aria-hidden className="mb-2 size-12 text-ink-3/70" strokeWidth={1.5} />
      <h2 className="text-[22px] font-bold">Esta sección no está disponible</h2>
      <p className="max-w-md text-[15px] text-ink-3">Tu sociedad no tiene esta parte de Omnia.</p>
      {home && (
        <LinkButton href={home} className="mt-3">
          Ir a Inicio
        </LinkButton>
      )}
    </div>
  );
}

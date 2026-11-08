import { Lock } from 'lucide-react';

/** Pantalla de módulo sin permiso: explica por qué, en vez de mostrar listas vacías. */
export function NoAccess({ module }: { module: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
      <Lock aria-hidden className="mb-2 size-12 text-ink-3/70" strokeWidth={1.5} />
      <h2 className="text-[22px] font-bold">Sin acceso a {module}</h2>
      <p className="max-w-md text-[15px] text-ink-3">
        Tu rol en esta sociedad no incluye este módulo. Si lo necesitas, pide a quien administra la sociedad que te lo añada en Ajustes › Roles y permisos.
      </p>
    </div>
  );
}

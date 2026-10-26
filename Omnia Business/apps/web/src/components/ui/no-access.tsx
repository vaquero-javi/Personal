import { Lock } from 'lucide-react';

/** Pantalla de módulo sin permiso: explica por qué, en vez de mostrar listas vacías. */
export function NoAccess({ module }: { module: string }) {
  return (
    <div className="flex flex-col items-start gap-2 p-6 md:p-10">
      <Lock aria-hidden className="size-6 text-ink-3" />
      <h2 className="text-lg font-bold">Sin acceso a {module}</h2>
      <p className="max-w-prose text-sm text-ink-2">
        Tu rol en esta sociedad no incluye este módulo. Si lo necesitas, pide a quien administra la sociedad que te lo añada en Ajustes › Roles y permisos.
      </p>
    </div>
  );
}

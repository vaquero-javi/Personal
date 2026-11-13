'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { ActionForm, FormError, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';

// El último horario usado se recuerda mientras dura la visita: al rellenar el
// cuadrante casi siempre se repite el mismo turno en varias celdas.
let lastUsed = { from: '08:00', to: '16:00', area: '' };

const field =
  'h-8 w-full min-w-0 rounded-md border-0 bg-fill px-1.5 text-[13px] text-ink focus:bg-sheet focus:ring-2 focus:ring-tint/45 focus:outline-none';

/**
 * Celda persona × día del cuadrante. Con permiso de gestión, el doble clic (o
 * el «+» que aparece al pasar por encima, para teclado y móvil) abre aquí
 * mismo un formulario de entrada y salida.
 */
export function ShiftCell({
  action,
  userId,
  date,
  label,
  editable,
  establishmentId,
  children,
}: {
  /** Empresa elegida arriba: el turno nuevo se crea en ella. */
  establishmentId?: string | null;
  action: FormAction;
  userId: string;
  date: string;
  /** «Ana, lun 10 nov», para lectores de pantalla. */
  label: string;
  editable: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const fromRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) fromRef.current?.focus();
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  if (!editable) return <td className="h-14 border-b border-l border-line-soft px-1.5 py-1.5 align-top">{children}</td>;

  return (
    <td
      className={`group/cell h-14 border-b border-l border-line-soft px-1.5 py-1.5 align-top ${open ? 'bg-fill' : 'cursor-cell hover:bg-fill/60'}`}
      onDoubleClick={(e) => {
        // El doble clic sobre el botón de borrar un turno no abre el editor.
        if ((e.target as HTMLElement).closest('button, form, input')) return;
        setOpen(true);
      }}
      title={open ? undefined : 'Doble clic para añadir un turno'}
    >
      {children}
      {open ? (
        <div
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <ActionForm action={action} successMessage="Turno creado" onSuccess={close} errorPlacement="manual" className="flex flex-col gap-1.5">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="date" value={date} />
            {establishmentId && <input type="hidden" name="establishmentId" value={establishmentId} />}
            <div className="grid grid-cols-2 gap-1">
              <input
                ref={fromRef}
                name="from"
                type="time"
                required
                defaultValue={lastUsed.from}
                aria-label={`Entrada · ${label}`}
                className={field}
                onChange={(e) => (lastUsed = { ...lastUsed, from: e.target.value })}
              />
              <input
                name="to"
                type="time"
                required
                defaultValue={lastUsed.to}
                aria-label={`Salida · ${label}`}
                className={field}
                onChange={(e) => (lastUsed = { ...lastUsed, to: e.target.value })}
              />
            </div>
            <input
              name="area"
              placeholder="Área (opcional)"
              defaultValue={lastUsed.area}
              aria-label={`Área o puesto · ${label}`}
              className={field}
              onChange={(e) => (lastUsed = { ...lastUsed, area: e.target.value })}
            />
            <div className="text-xs [&_p]:mb-0 [&_p]:px-2 [&_p]:py-1.5 [&_p]:text-xs">
              <FormError />
            </div>
            <div className="flex gap-1">
              <SubmitButton className="h-7 flex-1 px-2 text-xs">Guardar</SubmitButton>
              <button type="button" onClick={close} className="h-7 rounded-full px-2 text-xs font-semibold text-ink-3 hover:bg-sheet">
                Cancelar
              </button>
            </div>
          </ActionForm>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Añadir turno · ${label}`}
          className="flex h-6 w-full items-center justify-center rounded text-ink-3 opacity-0 group-hover/cell:opacity-100 hover:bg-sheet hover:text-tint focus-visible:opacity-100"
        >
          <Plus aria-hidden className="size-3.5" />
        </button>
      )}
    </td>
  );
}

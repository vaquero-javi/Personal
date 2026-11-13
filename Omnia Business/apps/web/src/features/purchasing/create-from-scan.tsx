'use client';

import { useId, useRef, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inputClass } from '@/components/ui/form';
import type { ItemOption } from '@/components/ui/line-items';

export type CreateResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface NewSupplierInput {
  legalName: string;
  taxId: string;
}
export type CreateSupplier = (input: NewSupplierInput) => Promise<CreateResult<{ value: string; label: string }>>;

export interface NewItemInput {
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  taxRate: string;
}
export type CreateItem = (input: NewItemInput) => Promise<CreateResult<ItemOption>>;

/** Unidades habituales (se puede escribir otra). */
const UNITS = ['ud', 'kg', 'l', 'botella', 'caja', 'garrafa', 'barril', 'paquete', 'servicio', 'h'];

/**
 * Hoja para dar de alta algo que la factura trae y el sistema no tiene. Se pinta
 * en <body> (portal): así su formulario no queda dentro del de la factura.
 */
function CreateSheet({
  trigger,
  title,
  description,
  submitLabel,
  onSubmit,
  children,
}: {
  trigger: string;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (data: FormData) => Promise<string | null>;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleId = useId();
  const close = () => dialog.current?.close();

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-7 gap-1 self-start px-2.5 text-[13px]"
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={2.4} />
        {trigger}
      </Button>
      {typeof document !== 'undefined' &&
        createPortal(
          <dialog
            ref={dialog}
            aria-labelledby={titleId}
            onClick={(e) => e.target === e.currentTarget && close()}
            className="m-auto w-[min(460px,calc(100vw-32px))] rounded-[22px] bg-sheet p-6 text-ink shadow-[var(--shadow-float)] backdrop:bg-black/30 open:animate-[sheet-pop_280ms_var(--ease-spring)] open:backdrop:animate-[scrim-in_250ms_ease]"
          >
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                start(async () => {
                  setError(null);
                  const failed = await onSubmit(data);
                  if (failed) setError(failed);
                  else close();
                });
              }}
            >
              <div>
                <h2 id={titleId} className="text-[20px] font-bold">{title}</h2>
                <p className="mt-1 text-[14px] text-ink-3">{description}</p>
              </div>
              {children}
              {error && (
                <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[14px] text-danger">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
                  {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                  {submitLabel}
                </Button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-[12px] text-ink-3">{hint}</p>}
    </div>
  );
}

/** «Crear proveedor» con lo leído de la factura (razón social y CIF), editable antes de guardar. */
export function CreateSupplierButton({ read, create, onCreated }: { read: NewSupplierInput; create: CreateSupplier; onCreated: (option: { value: string; label: string }) => void }) {
  return (
    <CreateSheet
      trigger="Crear proveedor"
      title="Nuevo proveedor"
      description="Con los datos leídos de la factura. Revísalos; el resto de la ficha (dirección, email, plazo de pago) lo puedes completar después en Compras › Proveedores."
      submitLabel="Crear proveedor"
      onSubmit={async (data) => {
        const res = await create({ legalName: String(data.get('legalName') ?? ''), taxId: String(data.get('taxId') ?? '') });
        if (!res.ok) return res.error;
        onCreated(res.value);
        return null;
      }}
    >
      <Labeled label="Razón social">{(id) => <input id={id} name="legalName" required maxLength={200} defaultValue={read.legalName} className={inputClass} />}</Labeled>
      <Labeled label="NIF / CIF">{(id) => <input id={id} name="taxId" maxLength={20} defaultValue={read.taxId} className={inputClass} autoCapitalize="characters" />}</Labeled>
    </CreateSheet>
  );
}

/** «Añadir al almacén» una línea de la factura que no corresponde a ningún artículo. */
export function CreateItemButton({ read, create, onCreated }: { read: NewItemInput; create: CreateItem; onCreated: (item: ItemOption) => void }) {
  const unitsId = useId();
  return (
    <CreateSheet
      trigger="Añadir al almacén"
      title="Nuevo artículo de almacén"
      description="Con lo que pone la factura. Al registrarla, entra en stock con su cantidad y su coste."
      submitLabel="Añadir artículo"
      onSubmit={async (data) => {
        const res = await create({
          name: String(data.get('name') ?? ''),
          sku: String(data.get('sku') ?? ''),
          barcode: String(data.get('barcode') ?? ''),
          unit: String(data.get('unit') ?? ''),
          taxRate: String(data.get('taxRate') ?? ''),
        });
        if (!res.ok) return res.error;
        onCreated(res.value);
        return null;
      }}
    >
      <Labeled label="Nombre">{(id) => <input id={id} name="name" required maxLength={200} defaultValue={read.name} className={inputClass} />}</Labeled>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Referencia" hint="Vacía: se pone una sola.">
          {(id) => <input id={id} name="sku" maxLength={40} defaultValue={read.sku} className={inputClass} autoCapitalize="characters" />}
        </Labeled>
        <Labeled label="Código de barras">{(id) => <input id={id} name="barcode" maxLength={40} defaultValue={read.barcode} inputMode="numeric" className={inputClass} />}</Labeled>
        <Labeled label="Unidad de stock">
          {(id) => (
            <>
              <input id={id} name="unit" required maxLength={20} defaultValue={read.unit} list={unitsId} className={inputClass} />
              <datalist id={unitsId}>
                {UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </>
          )}
        </Labeled>
        <Labeled label="IVA %">{(id) => <input id={id} name="taxRate" required inputMode="decimal" defaultValue={read.taxRate} className={inputClass} />}</Labeled>
      </div>
    </CreateSheet>
  );
}

/**
 * Qué pintar debajo del selector de proveedor cuando el documento leído trae uno
 * que no está dado de alta: el aviso con lo leído y «Crear proveedor». undefined
 * si se reconoció, si no se leyó nada o si el rol no puede crearlo.
 */
export function missingSupplier(
  scan: { supplierId: string | null; supplierName: string | null; supplierTaxId: string | null } | null,
  create: CreateSupplier | null,
): ((select: (option: { value: string; label: string }) => void) => ReactNode) | undefined {
  if (!scan || scan.supplierId || !create || !(scan.supplierName || scan.supplierTaxId)) return undefined;
  const read = [scan.supplierName, scan.supplierTaxId].filter(Boolean).join(' · ');
  return function MissingSupplier(select) {
    return (
      <div className="flex flex-col gap-1.5 rounded-[10px] bg-warning-soft px-3 py-2">
        <p className="text-[13px] text-warning">No está dado de alta: «{read}»</p>
        <CreateSupplierButton read={{ legalName: scan.supplierName ?? '', taxId: scan.supplierTaxId ?? '' }} create={create} onCreated={select} />
      </div>
    );
  };
}

/** «Añadir al almacén» en cada línea leída sin artículo. undefined si no hubo lectura o el rol no puede. */
export function createItemFor(
  scanned: boolean,
  create: CreateItem | null,
): ((line: { description: string; reference?: string; barcode?: string; taxRate: string }, onCreated: (item: ItemOption) => void) => ReactNode) | undefined {
  if (!scanned || !create) return undefined;
  return function CreateItemFromLine(line, onCreated) {
    return (
      <CreateItemButton
        read={{ name: line.description, sku: line.reference ?? '', barcode: line.barcode ?? '', unit: 'ud', taxRate: line.taxRate.replace('.', ',') }}
        create={create}
        onCreated={onCreated}
      />
    );
  };
}

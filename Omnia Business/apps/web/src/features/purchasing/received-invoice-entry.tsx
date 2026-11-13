'use client';

import { useEffect, useState, useTransition } from 'react';
import { Camera, FileText, FileUp, Keyboard, LoaderCircle, RotateCcw, ScanLine } from 'lucide-react';
import type { SupplierInvoiceScan } from '@omnia/purchasing/types';
import type { FormAction } from '@/components/ui/form';
import { Notice } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import type { ItemOption } from '@/components/ui/line-items';
import { InvoiceForm, type InvoiceInitial } from '@/features/invoicing/invoice-form';
import { shrink } from '@/lib/shrink-image';
import { createItemFor, missingSupplier, type CreateItem, type CreateSupplier } from './create-from-scan';

type Scan = (formData: FormData) => Promise<{ ok: true; scan: SupplierInvoiceScan } | { ok: false; error: string }>;
type Mode = 'manual' | 'scan';

const comma = (s: string) => s.replace('.', ',');

/**
 * Registro de una factura de proveedor de dos maneras: escribiéndola o a
 * partir de una foto o PDF. La foto solo rellena el formulario; nada se guarda
 * hasta que la persona lo revisa y pulsa «Registrar factura».
 */
export function ReceivedInvoiceEntry({
  action,
  scan,
  scanReady,
  suppliers,
  items,
  warehouses,
  accept,
  createSupplier,
  createItem,
}: {
  action: FormAction;
  scan: Scan;
  /** false si falta la clave de la API de Claude. */
  scanReady: boolean;
  suppliers: { value: string; label: string }[];
  items: ItemOption[];
  /** Almacenes donde puede entrar la mercancía de la factura. */
  warehouses: { value: string; label: string }[];
  accept: string;
  /** Dar de alta lo que la factura trae y no existe (null si el rol no puede). */
  createSupplier: CreateSupplier | null;
  createItem: CreateItem | null;
}) {
  const [mode, setMode] = useState<Mode>('manual');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SupplierInvoiceScan | null>(null);
  const [scans, setScans] = useState(0);
  const [reading, startReading] = useTransition();
  const [dragging, setDragging] = useState(false);
  const isPdf = file?.type === 'application/pdf';

  useEffect(() => {
    if (!file || !(file.type.startsWith('image/') || file.type === 'application/pdf')) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const read = () =>
    startReading(async () => {
      if (!file) return;
      setError(null);
      const data = new FormData();
      data.set('photo', await shrink(file));
      const res = await scan(data);
      if (!res.ok) return setError(res.error);
      setResult(res.scan);
      setScans((n) => n + 1);
      setMode('manual');
    });

  const restart = () => {
    setResult(null);
    setFile(null);
    setError(null);
    setMode('scan');
  };

  const initial: InvoiceInitial | undefined = result
    ? {
        ...(result.supplierId ? { partyId: result.supplierId } : {}),
        ...(result.invoiceNumber ? { supplierNumber: result.invoiceNumber } : {}),
        ...(result.date ? { issueDate: result.date } : {}),
        lines: result.lines.map((l) => ({
          itemId: l.itemId ?? '',
          description: l.description,
          quantity: comma(l.quantity),
          unit: comma(l.unitPrice),
          discountPct: comma(l.discountPct),
          taxRate: comma(l.taxRate),
          read: l.read,
          match: l.match,
          ...(l.reference ? { reference: l.reference } : {}),
          ...(l.barcode ? { barcode: l.barcode } : {}),
        })),
      }
    : undefined;

  const tab = (value: Mode, label: string, Icon: typeof Keyboard) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={`pressable flex items-center gap-2 rounded-[8px] px-4 py-1.5 text-sm ${mode === value ? 'bg-sheet font-semibold text-ink shadow-[var(--shadow-raised)] dark:bg-fill-strong' : 'text-ink-2 hover:text-ink'}`}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );

  /** Dos entradas: la cámara (en el móvil abre la cámara directamente) y el selector de archivos (PDF del correo o de la web del proveedor). */
  const pick = (kind: 'camera' | 'file', label: string, Icon: typeof Camera) => (
    <label
      className={`pressable flex cursor-pointer items-center gap-2 rounded-full bg-sheet px-4 py-2 font-medium text-ink shadow-[var(--shadow-raised)] has-focus-visible:ring-2 has-focus-visible:ring-tint/45 dark:bg-fill-strong ${
        !scanReady || reading ? 'pointer-events-none opacity-50' : 'hover:text-tint'
      }`}
    >
      <input
        type="file"
        name="photo"
        accept={kind === 'camera' ? 'image/*' : accept}
        {...(kind === 'camera' ? { capture: 'environment' as const } : {})}
        className="sr-only"
        disabled={!scanReady || reading}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setError(null);
          e.target.value = '';
        }}
      />
      <Icon aria-hidden className="size-4" />
      {label}
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Forma de registrar la factura" className="inline-flex self-start rounded-[10px] bg-fill p-0.5">
        {tab('manual', result ? 'Revisar y registrar' : 'Escribirla a mano', Keyboard)}
        {tab('scan', 'Foto o archivo', Camera)}
      </div>

      {mode === 'scan' ? (
        <div role="tabpanel" className="flex max-w-2xl flex-col gap-4">
          <p className="text-sm text-ink-2">
            Haz una foto a la factura en papel, con buena luz y sin sombras, o sube el archivo si el proveedor te la mandó por correo o la descargaste de su web (PDF o imagen). Se leen el proveedor, el número, la fecha y los artículos con su precio por unidad, y se rellena el formulario para que lo revises antes de registrarla.
          </p>
          {!scanReady && (
            <Notice tone="warning">
              La lectura de facturas (fotos y archivos) aún no está activada en esta instalación: falta la clave de la API de Gemini (<code>GEMINI_API_KEY</code>) o de Claude (<code>ANTHROPIC_API_KEY</code>). Mientras tanto, regístrala a mano.
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (scanReady && !reading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files[0];
              if (!dropped || !scanReady || reading) return;
              setFile(dropped);
              setError(null);
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-[10px] border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${
              file || dragging ? 'border-tint bg-tint-soft' : 'border-shelf-edge bg-fill/60'
            }`}
          >
            {preview && !isPdf ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
              <img src={preview} alt="Factura elegida" className="max-h-72 rounded-sm object-contain shadow-sm" />
            ) : file ? (
              <FileText aria-hidden className="size-8 text-ink-2" />
            ) : (
              <FileUp aria-hidden className="size-8 text-ink-3" />
            )}
            <span className="font-semibold text-ink">{file ? file.name : 'Arrastra aquí la factura o elige cómo subirla'}</span>
            <div className="flex flex-wrap justify-center gap-2">
              {pick('camera', 'Hacer una foto', Camera)}
              {pick('file', file ? 'Elegir otro archivo' : 'Subir archivo', FileUp)}
            </div>
            <span className="text-xs text-ink-3">PDF, JPG, PNG o WebP · hasta 7 MB</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={read} disabled={!file || !scanReady || reading} aria-busy={reading}>
              {reading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ScanLine aria-hidden className="size-4" />}
              {reading ? 'Leyendo la factura…' : 'Leer factura'}
            </Button>
            {reading && <span className="text-sm text-ink-3">Suele tardar entre 10 y 30 segundos.</span>}
          </div>
        </div>
      ) : (
        <div role="tabpanel" className={result && preview ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]' : ''}>
          <div className="flex min-w-0 flex-col gap-4">
            {result && (
              <div className="flex flex-col gap-2">
                <Notice tone={result.warnings.length ? 'warning' : 'ok'}>
                  Datos leídos de la factura: {result.lines.length} {result.lines.length === 1 ? 'línea' : 'líneas'}
                  {result.supplierRead ? ` de ${result.supplierRead}` : ''}. Revísalos antes de registrarla; lo marcado necesita tu atención.
                  {result.warnings.length > 0 && (
                    <span className="mt-1 block">
                      {result.warnings.map((w) => (
                        <span key={w} className="block">· {w}</span>
                      ))}
                    </span>
                  )}
                </Notice>
                <Button variant="ghost" className="self-start" onClick={restart}>
                  <RotateCcw aria-hidden className="size-4" />
                  Leer otra factura
                </Button>
              </div>
            )}
            <InvoiceForm
              key={scans}
              action={action}
              direction="received"
              parties={suppliers}
              items={items}
              warehouses={warehouses}
              {...(initial ? { initial } : {})}
              renderPartyMissing={missingSupplier(result, createSupplier)}
              renderCreateItem={createItemFor(result !== null, createItem)}
            />
          </div>
          {result && preview && (
            <figure className="hidden xl:block">
              <div className="sticky top-14">
                {isPdf ? (
                  <iframe src={preview} title="Factura en PDF para cotejar" className="h-[75vh] w-full rounded-sm border border-line bg-white shadow-sm" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
                  <img src={preview} alt="Foto de la factura para cotejar" className="w-full rounded-sm border border-line shadow-sm" />
                )}
                <figcaption className="mt-2 text-xs text-ink-3">La factura, para cotejar línea a línea.</figcaption>
              </div>
            </figure>
          )}
        </div>
      )}
    </div>
  );
}

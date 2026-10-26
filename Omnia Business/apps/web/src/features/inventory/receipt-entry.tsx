'use client';

import { useEffect, useState, useTransition } from 'react';
import { Camera, FileText, Keyboard, LoaderCircle, RotateCcw, ScanLine } from 'lucide-react';
import type { DeliveryNoteScan } from '@omnia/inventory';
import type { FormAction } from '@/components/ui/form';
import { Notice } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import type { CustomFieldDef } from '@/components/ui/custom-fields';
import type { ItemOption } from '@/components/ui/line-items';
import { formatDate } from '@/lib/format';
import { ReceiptForm, type ReceiptInitial } from './receipt-form';

type Scan = (formData: FormData) => Promise<{ ok: true; scan: DeliveryNoteScan } | { ok: false; error: string }>;
type Mode = 'manual' | 'scan';

/** Las fotos del móvil pesan varios MB: se reducen aquí (lado largo ≤ 2000 px) antes de subirlas. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 900_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

/**
 * Registro de un albarán de proveedor de dos maneras: escribiéndolo o a partir
 * de una foto. La foto solo rellena el formulario; nada se guarda hasta que la
 * persona lo revisa y pulsa «Guardar borrador».
 */
export function ReceiptEntry({
  action,
  scan,
  scanReady,
  suppliers,
  warehouses,
  items,
  customFields,
  accept,
}: {
  action: FormAction;
  scan: Scan;
  /** false si falta la clave de la API de Claude. */
  scanReady: boolean;
  suppliers: { value: string; label: string }[];
  warehouses: { value: string; label: string }[];
  items: ItemOption[];
  customFields: CustomFieldDef[];
  accept: string;
}) {
  const [mode, setMode] = useState<Mode>('manual');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryNoteScan | null>(null);
  /** El archivo tal como se leyó (ya reducido): es el que se guarda con el albarán. */
  const [scanned, setScanned] = useState<File | null>(null);
  const [scans, setScans] = useState(0);
  const [reading, startReading] = useTransition();

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const read = () =>
    startReading(async () => {
      if (!file) return;
      setError(null);
      const upload = await shrink(file);
      const data = new FormData();
      data.set('photo', upload);
      const res = await scan(data);
      if (!res.ok) return setError(res.error);
      setResult(res.scan);
      setScanned(upload);
      setScans((n) => n + 1);
      setMode('manual');
    });

  const restart = () => {
    setResult(null);
    setScanned(null);
    setFile(null);
    setError(null);
    setMode('scan');
  };

  const initial: ReceiptInitial | undefined = result
    ? {
        ...(result.supplierId ? { supplierId: result.supplierId } : {}),
        ...(result.deliveryNoteNumber ? { supplierDeliveryNote: result.deliveryNoteNumber } : {}),
        ...(result.date ? { notes: `Albarán del ${formatDate(result.date)} (leído de una foto).` } : {}),
        lines: result.lines.map((l) => ({
          itemId: l.itemId ?? '',
          description: '',
          quantity: l.quantity,
          unit: l.unitCost,
          discountPct: '0',
          taxRate: '21',
          read: l.read,
          match: l.match,
        })),
      }
    : undefined;

  const tab = (value: Mode, label: string, Icon: typeof Keyboard) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={`flex items-center gap-2 rounded px-4 py-2 text-sm transition-colors ${mode === value ? 'bg-ink font-semibold text-white' : 'text-ink-2 hover:text-ink'}`}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Forma de registrar el albarán" className="inline-flex self-start rounded-md border border-shelf-edge p-0.5">
        {tab('manual', result ? 'Revisar y guardar' : 'Escribirlo a mano', Keyboard)}
        {tab('scan', 'Escanear foto', Camera)}
      </div>

      {mode === 'scan' ? (
        <div role="tabpanel" className="flex max-w-2xl flex-col gap-4">
          <p className="text-sm text-ink-2">
            Haz una foto a la hoja entera, con buena luz y sin sombras, o sube el PDF que te mandó el proveedor. Se leen el proveedor, el número de albarán y las líneas, y se rellena el formulario para que lo revises antes de guardarlo.
          </p>
          {!scanReady && (
            <Notice tone="warning">
              La lectura de fotos aún no está activada en esta instalación: falta la clave de la API de Claude (<code>ANTHROPIC_API_KEY</code>). Mientras tanto, regístralo a mano.
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-center text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ink/30 ${
              file ? 'border-ink bg-sheet' : 'border-shelf-edge bg-sheet-head hover:border-ink'
            }`}
          >
            <input
              type="file"
              name="photo"
              accept={accept}
              capture="environment"
              className="sr-only"
              disabled={!scanReady || reading}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
              <img src={preview} alt="Foto del albarán elegida" className="max-h-72 rounded-sm object-contain shadow-sm" />
            ) : file ? (
              <FileText aria-hidden className="size-8 text-ink-2" />
            ) : (
              <Camera aria-hidden className="size-8 text-ink-3" />
            )}
            <span className="font-semibold text-ink">{file ? file.name : 'Hacer una foto o elegir archivo'}</span>
            <span className="text-xs text-ink-3">{file ? 'Toca para cambiarla' : 'JPG, PNG, WebP o PDF · hasta 7 MB'}</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={read} disabled={!file || !scanReady || reading} aria-busy={reading}>
              {reading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ScanLine aria-hidden className="size-4" />}
              {reading ? 'Leyendo el albarán…' : 'Leer albarán'}
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
                  Datos leídos de la foto: {result.lines.length} {result.lines.length === 1 ? 'línea' : 'líneas'}
                  {result.supplierRead ? ` de ${result.supplierRead}` : ''}. Revísalos antes de guardar; lo marcado necesita tu atención.
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
                  Escanear otra foto
                </Button>
              </div>
            )}
            <ReceiptForm
              key={scans}
              action={action}
              suppliers={suppliers}
              warehouses={warehouses}
              items={items}
              customFields={customFields}
              accept={accept}
              photo={result ? scanned : null}
              {...(initial ? { initial } : {})}
            />
          </div>
          {result && preview && (
            <figure className="hidden xl:block">
              <div className="sticky top-14">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                <img src={preview} alt="Foto del albarán para cotejar" className="w-full rounded-sm border border-line shadow-sm" />
                <figcaption className="mt-2 text-xs text-ink-3">La foto, para cotejar línea a línea.</figcaption>
              </div>
            </figure>
          )}
        </div>
      )}
    </div>
  );
}

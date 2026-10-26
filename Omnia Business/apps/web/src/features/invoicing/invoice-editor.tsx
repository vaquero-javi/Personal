'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, QrCode } from 'lucide-react';
import { ActionForm, FormError, Notice, SelectField, TextAreaField, TextField, inputClass, type FormAction } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { LineErrors, LineItems, type ItemOption, type LineDraft } from '@/components/ui/line-items';
import { addDays, formatDate, formatEuro, formatQty } from '@/lib/format';
import { paymentMethod } from '@/lib/labels';

export interface CustomerOption {
  id: string;
  legalName: string;
  taxId: string | null;
  address: string | null;
  termsDays: number;
}

export interface SeriesOption {
  id: string;
  code: string;
  fiscalYear: number;
  kind: 'standard' | 'simplified' | 'rectifying';
  nextNumber: number;
}

export interface EditorInitial {
  invoiceType: string;
  partyId: string;
  operationDate: string;
  dueDate: string;
  paymentMethod: string;
  withholdingRate: string;
  notes: string;
  lines: LineDraft[];
}

const WITHHOLDING = [
  { value: '0', label: 'Sin retención' },
  { value: '7', label: '7 % · profesional, primeros años' },
  { value: '15', label: '15 % · actividad profesional' },
  { value: '19', label: '19 % · arrendamiento' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => Number(s.replace(',', '.')) || 0;
const kindOf = (type: string): SeriesOption['kind'] => (type.startsWith('R') ? 'rectifying' : type === 'F2' ? 'simplified' : 'standard');
const fullNumber = (s: SeriesOption) => `${s.code}-${s.fiscalYear}-${String(s.nextNumber).padStart(6, '0')}`;

/**
 * Apartado de creación de facturas: el formulario a la izquierda y, al lado,
 * la factura tal como saldrá. Se puede guardar como borrador o emitir en el
 * mismo paso (número correlativo + huella VeriFactu). Los importes de la
 * vista previa redondean igual que la base de datos, que es quien manda.
 */
export function InvoiceEditor({
  action,
  issuer,
  customers,
  items,
  series,
  canIssue,
  today,
  initial,
  seriesHref,
  newCustomerHref,
  editing = false,
}: {
  action: FormAction;
  issuer: { legalName: string; tradeName: string | null; taxId: string; verifactu: boolean };
  customers: CustomerOption[];
  items: ItemOption[];
  series: SeriesOption[];
  canIssue: boolean;
  today: string;
  initial?: EditorInitial;
  seriesHref: string;
  newCustomerHref: string;
  editing?: boolean;
}) {
  const [type, setType] = useState(initial?.invoiceType ?? 'F1');
  const [partyId, setPartyId] = useState(initial?.partyId ?? '');
  const [lines, setLines] = useState<LineDraft[]>(initial?.lines ?? []);
  const [issueDate, setIssueDate] = useState(today);
  const [operationDate, setOperationDate] = useState(initial?.operationDate ?? '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [method, setMethod] = useState(initial?.paymentMethod ?? 'transfer');
  const [withholding, setWithholding] = useState(initial?.withholdingRate ?? '0');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const customer = customers.find((c) => c.id === partyId);
  const usable = series.filter((s) => s.kind === kindOf(type));
  const [seriesId, setSeriesId] = useState(usable[0]?.id ?? '');
  const chosen = usable.find((s) => s.id === seriesId) ?? usable[0];
  const rectifying = type.startsWith('R');
  const onLines = useCallback((next: LineDraft[]) => setLines(next), []);

  const totals = useMemo(() => {
    const filled = lines.filter((l) => l.itemId || l.description.trim());
    const rows = filled.map((l) => {
      const base = round2(num(l.quantity) * num(l.unit) * (1 - num(l.discountPct) / 100));
      return { ...l, base, tax: round2((base * num(l.taxRate)) / 100) };
    });
    const byRate = new Map<number, { base: number; tax: number }>();
    for (const r of rows) {
      const rate = num(r.taxRate);
      const acc = byRate.get(rate) ?? { base: 0, tax: 0 };
      byRate.set(rate, { base: round2(acc.base + r.base), tax: round2(acc.tax + r.tax) });
    }
    const subtotal = round2(rows.reduce((s, r) => s + r.base, 0));
    const tax = round2(rows.reduce((s, r) => s + r.tax, 0));
    const withheld = round2((subtotal * num(withholding)) / 100);
    return { rows, byRate: [...byRate.entries()].sort((a, b) => b[0] - a[0]), subtotal, tax, withheld, total: round2(subtotal + tax - withheld) };
  }, [lines, withholding]);

  const termsDue = customer ? addDays(issueDate || today, customer.termsDays) : addDays(issueDate || today, 0);
  const effectiveDue = dueDate || termsDue;
  const noTaxId = type === 'F1' && customer && !customer.taxId;

  return (
    <ActionForm action={action} errorPlacement="manual" className="grid grid-cols-[minmax(0,1fr)] gap-px border-b border-line bg-line xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <input type="hidden" name="invoiceType" value={type} />
      <div className="flex min-w-0 flex-col gap-px">
        <Section title="Tipo y cliente">
          {!rectifying && (
            <fieldset className="mb-4">
              <legend className="mb-1.5 text-xs font-semibold text-ink-3">Tipo de factura</legend>
              <div className="inline-grid grid-cols-2 rounded-md border border-shelf-edge p-0.5 text-sm">
                {(
                  [
                    ['F1', 'Completa'],
                    ['F2', 'Simplificada'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className={`cursor-pointer rounded px-4 py-1.5 text-center transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ink/30 ${type === value ? 'bg-ink font-semibold text-white' : 'text-ink-2 hover:text-ink'}`}>
                    <input
                      type="radio"
                      name="_type"
                      value={value}
                      checked={type === value}
                      onChange={() => {
                        setType(value);
                        setSeriesId(series.find((s) => s.kind === kindOf(value))?.id ?? '');
                      }}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-ink-3">{type === 'F1' ? 'Con los datos fiscales del cliente. La que necesita una empresa para deducirse el IVA.' : 'Ticket de hasta 400 € (IVA incluido). El cliente es opcional.'}</p>
            </fieldset>
          )}
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <SelectField
              label="Cliente"
              name="partyId"
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              placeholder={type === 'F2' ? 'Cliente de mostrador (sin datos)' : 'Elige un cliente…'}
              options={customers.map((c) => ({ value: c.id, label: c.taxId ? `${c.legalName} · ${c.taxId}` : c.legalName }))}
              required={type !== 'F2'}
            />
            <a href={newCustomerHref} target="_blank" rel="noreferrer" className="inline-flex h-[34px] items-center gap-1.5 text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              Dar de alta un cliente
              <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </div>
          {customer && (
            <p className="mt-2 text-sm text-ink-2">
              {customer.address ?? 'Sin dirección de facturación'} · Paga a {customer.termsDays ? `${customer.termsDays} días` : 'la vista'}
            </p>
          )}
          {noTaxId && (
            <div className="mt-3">
              <Notice tone="warning">Este cliente no tiene NIF. Una factura completa debe llevarlo: añádelo en su ficha o emite una simplificada.</Notice>
            </div>
          )}
        </Section>

        <Section title="Conceptos">
          <LineItems items={items} mode="price" allowFreeText initial={initial?.lines ?? []} showTotals={false} onChange={onLines} />
          <LineErrors />
        </Section>

        <Section title="Fechas y cobro">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label="Vencimiento"
              name="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              hint={`Vacío: ${formatDate(termsDue)}${customer ? `, a ${customer.termsDays} días` : ''}`}
            />
            <TextField
              label="Fecha de operación"
              name="operationDate"
              type="date"
              value={operationDate}
              onChange={(e) => setOperationDate(e.target.value)}
              hint="Solo si el servicio o la entrega fue otro día"
            />
            <SelectField label="Forma de pago" name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value)} options={Object.entries(paymentMethod).map(([value, label]) => ({ value, label }))} />
            <SelectField
              label="Retención de IRPF"
              name="withholdingRate"
              value={withholding}
              onChange={(e) => setWithholding(e.target.value)}
              options={WITHHOLDING.some((w) => w.value === withholding) ? WITHHOLDING : [...WITHHOLDING, { value: withholding, label: `${withholding} %` }]}
              hint="Se resta del total a cobrar"
            />
            <TextAreaField
              label="Observaciones"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              placeholder="Número de pedido del cliente, cuenta para la transferencia…"
              className="md:col-span-2"
            />
          </div>
        </Section>

        <section aria-label="Guardar o emitir" className="sticky bottom-0 z-10 flex flex-col gap-3 bg-sheet px-4 py-4 shadow-[0_-6px_12px_-10px_rgb(22_24_29/0.35)] md:px-5">
          <FormError />
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <p className="mr-auto flex flex-col">
              <span className="text-xs font-semibold text-ink-3">{totals.withheld ? 'Total a cobrar' : 'Total'}</span>
              <b className="text-xl">{formatEuro(totals.total)}</b>
            </p>
            {canIssue && chosen && (
              <div className="flex flex-wrap items-end gap-3">
                {usable.length > 1 && (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-ink-3">Serie</span>
                    <select name="seriesId" value={chosen.id} onChange={(e) => setSeriesId(e.target.value)} className={`${inputClass} w-auto`}>
                      {usable.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.fiscalYear}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {usable.length === 1 && <input type="hidden" name="seriesId" value={chosen.id} />}
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ink-3">Fecha de expedición</span>
                  <input type="date" name="issueDate" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={`${inputClass} w-auto`} />
                </label>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="draft" variant="secondary" pendingLabel="Guardando…">
                {editing ? 'Guardar cambios' : 'Guardar borrador'}
              </SubmitButton>
              {canIssue && chosen && (
                <SubmitButton name="intent" value="issue" pendingLabel="Emitiendo…">
                  Emitir factura
                </SubmitButton>
              )}
            </div>
          </div>
          {!canIssue && <p className="text-sm text-ink-2">Tu rol prepara borradores; la emite quien tenga permiso de emisión.</p>}
          {canIssue && !chosen && (
            <p className="text-sm text-ink-2">
              Para emitirla hace falta una serie {kindOf(type) === 'simplified' ? 'de simplificadas' : kindOf(type) === 'rectifying' ? 'de rectificativas' : 'de facturas'} activa.{' '}
              <Link href={seriesHref} className="text-ink underline underline-offset-2">Crear serie</Link>. Mientras, puedes guardarla como borrador.
            </p>
          )}
        </section>
      </div>

      <aside aria-label="Vista previa" className="bg-sheet-head px-4 py-5 md:px-5">
        <div className="xl:sticky xl:top-14">
          <h3 className="mb-3 text-sm font-bold">Así se verá</h3>
          <Preview
            issuer={issuer}
            type={type}
            number={chosen ? fullNumber(chosen) : null}
            issueDate={issueDate}
            operationDate={operationDate}
            dueDate={effectiveDue}
            customer={customer}
            method={method}
            withholding={num(withholding)}
            notes={notes}
            totals={totals}
          />
        </div>
      </aside>
    </ActionForm>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 bg-sheet px-4 py-4 md:px-5">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Preview({
  issuer,
  type,
  number,
  issueDate,
  operationDate,
  dueDate,
  customer,
  method,
  withholding,
  notes,
  totals,
}: {
  issuer: { legalName: string; tradeName: string | null; taxId: string; verifactu: boolean };
  type: string;
  number: string | null;
  issueDate: string;
  operationDate: string;
  dueDate: string;
  customer: CustomerOption | undefined;
  method: string;
  withholding: number;
  notes: string;
  totals: {
    rows: (LineDraft & { base: number; tax: number })[];
    byRate: [number, { base: number; tax: number }][];
    subtotal: number;
    tax: number;
    withheld: number;
    total: number;
  };
}) {
  const title = type === 'F2' ? 'Factura simplificada' : type.startsWith('R') ? 'Factura rectificativa' : 'Factura';
  return (
    <article className="rounded-sm bg-sheet px-5 py-6 text-sm leading-snug shadow-[0_1px_2px_rgb(22_24_29/0.08),0_8px_24px_-12px_rgb(22_24_29/0.25)]">
      <header className="flex items-start justify-between gap-4 border-b border-ink pb-4">
        <div className="min-w-0">
          <p className="font-bold">{issuer.tradeName ?? issuer.legalName}</p>
          {issuer.tradeName && <p className="text-ink-2">{issuer.legalName}</p>}
          <p className="text-ink-2">NIF {issuer.taxId}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold">{title}</p>
          <p className={number ? '' : 'text-ink-3'}>{number ?? 'Nº al emitir'}</p>
          <p className="text-ink-2">{formatDate(issueDate)}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 border-b border-line py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-3">Cliente</p>
          {customer ? (
            <>
              <p className="font-semibold">{customer.legalName}</p>
              {customer.taxId ? <p>NIF {customer.taxId}</p> : <p className="text-danger">Sin NIF</p>}
              {customer.address && <p className="text-ink-2">{customer.address}</p>}
            </>
          ) : (
            <p className="text-ink-3">{type === 'F2' ? 'Cliente de mostrador' : 'Elige un cliente'}</p>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-0.5 text-right">
          {operationDate && operationDate !== issueDate && (
            <>
              <dt className="text-left text-ink-3">Operación</dt>
              <dd>{formatDate(operationDate)}</dd>
            </>
          )}
          <dt className="text-left text-ink-3">Vence</dt>
          <dd>{formatDate(dueDate)}</dd>
          <dt className="text-left text-ink-3">Pago</dt>
          <dd>{paymentMethod[method] ?? '—'}</dd>
        </dl>
      </section>

      {totals.rows.length === 0 ? (
        <p className="border-b border-line py-6 text-center text-ink-3">Los conceptos que añadas aparecerán aquí.</p>
      ) : (
        <table className="w-full border-b border-line">
          <thead>
            <tr className="text-xs text-ink-3">
              <th className="py-2 text-left font-semibold">Concepto</th>
              <th className="py-2 text-right font-semibold">Cant.</th>
              <th className="py-2 text-right font-semibold">Precio</th>
              <th className="py-2 text-right font-semibold">Importe</th>
            </tr>
          </thead>
          <tbody>
            {totals.rows.map((r, i) => (
              <tr key={i} className="border-t border-line-soft align-top">
                <td className="py-1.5 pr-2">
                  {r.description || '—'}
                  {num(r.discountPct) > 0 && <span className="block text-ink-3">Dto. {formatQty(num(r.discountPct))} %</span>}
                </td>
                <td className="py-1.5 text-right">{formatQty(num(r.quantity))}</td>
                <td className="py-1.5 pl-2 text-right">{formatEuro(num(r.unit))}</td>
                <td className="py-1.5 pl-2 text-right">{formatEuro(r.base)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <dl className="ml-auto grid max-w-64 grid-cols-[1fr_auto] gap-x-4 gap-y-1 pt-3">
        <dt className="text-ink-2">Base imponible</dt>
        <dd className="text-right">{formatEuro(totals.subtotal)}</dd>
        {totals.byRate.map(([rate, t]) => (
          <div key={rate} className="contents">
            <dt className="text-ink-2">
              IVA {formatQty(rate)} %{totals.byRate.length > 1 && <span className="text-ink-3"> s/ {formatEuro(t.base)}</span>}
            </dt>
            <dd className="text-right">{formatEuro(t.tax)}</dd>
          </div>
        ))}
        {totals.withheld > 0 && (
          <>
            <dt className="text-ink-2">Retención IRPF {formatQty(withholding)} %</dt>
            <dd className="text-right">−{formatEuro(totals.withheld)}</dd>
          </>
        )}
        <span aria-hidden className="col-span-2 mt-0.5 border-t border-ink" />
        <dt className="pt-0.5 font-bold">{totals.withheld ? 'Total a cobrar' : 'Total'}</dt>
        <dd className="pt-0.5 text-right text-base font-bold">{formatEuro(totals.total)}</dd>
      </dl>

      {notes.trim() && <p className="mt-4 border-t border-line pt-3 whitespace-pre-line text-ink-2">{notes}</p>}

      {issuer.verifactu && (
        <footer className="mt-5 flex items-center gap-3 border-t border-line pt-4 text-xs text-ink-2">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-sm border border-dashed border-shelf-edge text-ink-3">
            <QrCode aria-hidden className="size-6" />
          </span>
          <span>
            <b className="block text-ink">VERI*FACTU</b>
            Factura verificable en la sede electrónica de la AEAT. El código QR se genera al emitirla.
          </span>
        </footer>
      )}
    </article>
  );
}

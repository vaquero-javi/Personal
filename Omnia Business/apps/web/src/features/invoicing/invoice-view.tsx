import Link from 'next/link';
import { Badge, Cell, EmptyState, Facts, PageHeader, Ruled, StatusBadge } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, Notice, SelectField, TextField } from '@/components/ui/form';
import { LinkButton, SubmitButton } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/button-styles';
import { Download } from 'lucide-react';
import { formatDate, formatDateTime, formatEuro, formatQty, percent, todayIso } from '@/lib/format';
import { LimitBar } from '@/features/home/panels';
import { fiscalStatus, invoiceStatus, invoiceType, paymentMethod, receivedInvoiceStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import {
  createRectifying,
  deleteInvoiceDraft,
  issueInvoice,
  registerPayment,
  requeueFiscal,
} from '@/app/o/[org]/facturacion/actions';

/** Ficha de factura emitida o recibida, con sus acciones según estado y permisos. */
export async function InvoiceView({ org, id, back }: { org: string; id: string; back: { href: string; label: string } }) {
  const { ctx, can } = await requireOrg(org);
  const inv = await container().invoicing.get(ctx, id);
  const issued = inv.direction === 'issued';
  const series = issued && inv.status === 'draft' ? (await container().invoicing.series(ctx)).filter((s) => s.isActive) : [];
  const pending = Number(inv.total) - Number(inv.paidTotal);
  const statusMap = issued ? invoiceStatus : receivedInvoiceStatus;
  const pdf = `/o/${org}/facturacion/${inv.id}/pdf`;
  const wantedKind = inv.invoiceType.startsWith('R') ? 'rectifying' : inv.invoiceType === 'F2' ? 'simplified' : 'standard';

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inv.fullNumber ?? 'Borrador de factura'}
            <StatusBadge map={statusMap} value={inv.status} />
            {inv.overdueDays ? <Badge tone="danger">Vencida hace {inv.overdueDays} días</Badge> : null}
          </span>
        }
        description={`${invoiceType[inv.invoiceType]} · ${inv.partyName ?? 'Cliente de mostrador'}${inv.partyTaxId ? ` (${inv.partyTaxId})` : ''}`}
        back={back}
        actions={
          issued && (
            <>
              {inv.status !== 'draft' && (
                <a href={`${pdf}?descargar=1`} download className={buttonClass('primary')}>
                  <Download aria-hidden className="size-4" />
                  Descargar PDF
                </a>
              )}
              {inv.status === 'draft' && can('invoicing.write') && <LinkButton href={`/o/${org}/facturacion/${inv.id}/editar`}>Editar borrador</LinkButton>}
              {can('invoicing.write') && (inv.invoiceType !== 'F2' || inv.partyId) ? <LinkButton href={`/o/${org}/facturacion/nueva?desde=${inv.id}`}>Duplicar</LinkButton> : null}
            </>
          )
        }
      />
      <Ruled cols="xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell title="Líneas">
          <Table minWidth={620}>
            <thead>
              <tr>
                <Th>Concepto</Th>
                <Th align="right">Cantidad</Th>
                <Th align="right">Precio</Th>
                <Th align="right">Dto.</Th>
                <Th align="right">IVA</Th>
                <Th align="right">Base</Th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <Tr key={l.id}>
                  <Td>{l.description}</Td>
                  <Td align="right">{formatQty(l.quantity)}</Td>
                  <Td align="right">{formatEuro(l.unitPrice)}</Td>
                  <Td align="right" className="text-ink-2">{Number(l.discountPct) ? `${Number(l.discountPct)} %` : '—'}</Td>
                  <Td align="right" className="text-ink-2">{Number(l.taxRate)} %</Td>
                  <Td align="right">{formatEuro(l.lineBase)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <dl className="mt-4 ml-auto grid max-w-72 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            {inv.status === 'draft' && issued ? (
              <>
                <dt className="text-ink-3">Base (orientativa)</dt>
                <dd className="text-right">{formatEuro(inv.lines.reduce((s, l) => s + Number(l.lineBase), 0))}</dd>
                <dt className="text-ink-3">IVA (orientativo)</dt>
                <dd className="text-right">{formatEuro(inv.lines.reduce((s, l) => s + Number(l.lineTax), 0))}</dd>
                {Number(inv.withholdingRate) > 0 && (
                  <>
                    <dt className="text-ink-3">Retención IRPF {Number(inv.withholdingRate)} %</dt>
                    <dd className="text-right">al emitir</dd>
                  </>
                )}
              </>
            ) : (
              <>
                <dt className="text-ink-3">Base imponible</dt>
                <dd className="text-right">{formatEuro(inv.subtotal)}</dd>
                {inv.taxBreakdown.map((t) => (
                  <div key={t.taxRate} className="contents">
                    <dt className="text-ink-3">IVA {Number(t.taxRate)} % s/ {formatEuro(t.base)}</dt>
                    <dd className="text-right">{formatEuro(t.tax)}</dd>
                  </div>
                ))}
                {Number(inv.withholdingTotal) > 0 && (
                  <>
                    <dt className="text-ink-3">Retención IRPF {Number(inv.withholdingRate)} %</dt>
                    <dd className="text-right">−{formatEuro(inv.withholdingTotal)}</dd>
                  </>
                )}
                <dt className="font-semibold">{Number(inv.withholdingTotal) > 0 ? 'Total a cobrar' : 'Total'}</dt>
                <dd className="text-right text-base font-bold">{formatEuro(inv.total)}</dd>
              </>
            )}
          </dl>
          {inv.notes && <p className="mt-4 border-t border-line-soft pt-3 text-sm whitespace-pre-line text-ink-2">{inv.notes}</p>}
        </Cell>

        <Cell title="Datos">
          <Facts
            items={[
              ['Fecha', formatDate(inv.issueDate)],
              ...(inv.operationDate && inv.operationDate !== inv.issueDate ? [['Fecha de operación', formatDate(inv.operationDate)] as [string, string]] : []),
              ['Vencimiento', formatDate(inv.dueDate)],
              ['Forma de pago', inv.paymentMethod ? paymentMethod[inv.paymentMethod] : null],
              ['Serie', inv.seriesCode],
              ['Rectifica a', inv.rectifiesInvoiceId ? <Link className="underline-offset-2 hover:underline" href={`/o/${org}/facturacion/${inv.rectifiesInvoiceId}`}>{inv.rectifiesNumber}</Link> : null],
              [
                'Pagado',
                inv.status === 'draft' ? null : (
                  <span key="p" className="block">
                    {formatEuro(inv.paidTotal)} de {formatEuro(inv.total)}
                    <LimitBar value={percent(inv.paidTotal, inv.total)} tone={pending <= 0 ? 'ok' : 'neutral'} label="Pagado sobre total" />
                  </span>
                ),
              ],
            ]}
          />

          {issued && inv.status === 'draft' && (
            <div className="mt-5 border-t border-line pt-4">
              {can('invoicing.issue') ? (
                series.filter((s) => s.invoiceKind === wantedKind).length === 0 ? (
                  <Notice tone="warning">
                    No hay ninguna serie activa de este tipo. Créala en <Link className="underline" href={`/o/${org}/facturacion/series`}>Facturación › Series</Link>.
                  </Notice>
                ) : (
                  <ActionForm action={issueInvoice.bind(null, org, inv.id)} className="flex flex-col gap-3">
                    <p className="text-sm text-ink-2">Al emitirla se le asigna número correlativo, se calculan los totales y se encadena su huella VeriFactu. Después ya no se puede modificar.</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SelectField label="Serie" name="seriesId" options={series.filter((s) => s.invoiceKind === wantedKind).map((s) => ({ value: s.id, label: `${s.code} · ${s.fiscalYear} (siguiente nº ${s.nextNumber})` }))} />
                      <TextField label="Fecha de expedición" name="issueDate" type="date" defaultValue={todayIso()} />
                    </div>
                    <div>
                      <SubmitButton pendingLabel="Emitiendo…">Emitir factura</SubmitButton>
                    </div>
                  </ActionForm>
                )
              ) : (
                <Notice tone="warning">Tu rol puede preparar borradores pero no emitirlos.</Notice>
              )}
              {can('invoicing.write') && (
                <ActionForm action={deleteInvoiceDraft.bind(null, org, inv.id)} className="mt-3">
                  <SubmitButton variant="danger" pendingLabel="Borrando…">Borrar borrador</SubmitButton>
                </ActionForm>
              )}
            </div>
          )}

          {inv.status !== 'draft' && inv.status !== 'cancelled' && pending > 0 && can('invoicing.write') && (
            <div className="mt-5 border-t border-line pt-4">
              <h4 className="mb-3 text-sm font-bold">{issued ? 'Registrar cobro' : 'Registrar pago'}</h4>
              <ActionForm action={registerPayment.bind(null, org, inv.id)} className="flex flex-col gap-3" resetOnSuccess>
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField label="Importe" name="amount" inputMode="decimal" defaultValue={pending.toFixed(2).replace('.', ',')} required />
                  <TextField label="Fecha" name="paidAt" type="date" defaultValue={todayIso()} required />
                  <SelectField label="Forma de pago" name="method" options={Object.entries(paymentMethod).map(([value, label]) => ({ value, label }))} defaultValue="transfer" />
                  <TextField label="Referencia" name="reference" placeholder="Opcional" />
                </div>
                <div>
                  <SubmitButton pendingLabel="Registrando…">{issued ? 'Registrar cobro' : 'Registrar pago'}</SubmitButton>
                </div>
              </ActionForm>
            </div>
          )}

          {issued && inv.status !== 'draft' && !inv.invoiceType.startsWith('R') && can('invoicing.write') && (
            <div className="mt-5 border-t border-line pt-4">
              <ActionForm action={createRectifying.bind(null, org, inv.id)}>
                <p className="mb-2 text-sm text-ink-2">Una factura emitida no se edita: para corregirla, emite una rectificativa.</p>
                <SubmitButton variant="secondary" pendingLabel="Preparando…">Crear rectificativa</SubmitButton>
              </ActionForm>
            </div>
          )}
        </Cell>
      </Ruled>

      <Ruled cols={issued && inv.status !== 'draft' ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}>
        <Cell title={issued ? 'Cobros' : 'Pagos'}>
          {inv.payments.length === 0 ? (
            <EmptyState title={issued ? 'Sin cobros registrados' : 'Sin pagos registrados'} />
          ) : (
            <ul className="divide-y divide-line-soft text-sm">
              {inv.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 py-2">
                  <span>
                    {formatDate(p.paidAt)} · {paymentMethod[p.method]}
                    {p.reference && <span className="text-ink-3"> · {p.reference}</span>}
                  </span>
                  <b>{formatEuro(p.amount)}</b>
                </li>
              ))}
            </ul>
          )}
        </Cell>
        {issued && inv.status !== 'draft' && (
          <Cell title="Registro VeriFactu">
            <div className="mb-3">
              <StatusBadge map={fiscalStatus} value={inv.fiscalStatus} />
            </div>
            {inv.fiscalResponse?.message && <Notice tone="danger">AEAT {inv.fiscalResponse.code}: {inv.fiscalResponse.message}</Notice>}
            <Facts
              items={[
                ['Generado', formatDateTime(inv.fiscalRecordAt)],
                ['Huella', <code key="h" className="text-xs break-all">{inv.fiscalRecordHash}</code>],
                ['Huella anterior', inv.fiscalPreviousHash ? <code key="p" className="text-xs break-all">{inv.fiscalPreviousHash}</code> : 'Primer registro de la cadena'],
              ]}
            />
            {inv.fiscalStatus === 'rejected' && can('invoicing.issue') && (
              <ActionForm action={requeueFiscal.bind(null, org, inv.id)} className="mt-4">
                <p className="mb-2 text-sm text-ink-2">Corrige el dato del cliente (por ejemplo su NIF) y vuelve a enviar el registro.</p>
                <SubmitButton variant="secondary" pendingLabel="Enviando…">Reenviar a la AEAT</SubmitButton>
              </ActionForm>
            )}
          </Cell>
        )}
      </Ruled>

      {issued && (
        <Ruled cols="">
          <Cell
            title={inv.status === 'draft' ? 'Borrador en A4' : 'Factura en A4'}
            actions={
              <>
                <a href={pdf} target="_blank" rel="noreferrer" className={buttonClass('secondary')}>
                  Abrir
                </a>
                <a href={`${pdf}?descargar=1`} download className={buttonClass('secondary')}>
                  <Download aria-hidden className="size-4" />
                  Descargar
                </a>
              </>
            }
          >
            {inv.status === 'draft' && <p className="mb-3 text-sm text-ink-2">Lleva la marca «Borrador» y no tiene validez fiscal hasta que la emitas.</p>}
            <div className="hidden bg-sheet-head p-4 md:block md:p-6">
              <iframe src={`${pdf}#toolbar=0&navpanes=0&view=FitH`} title="Factura en A4" className="mx-auto block aspect-[210/297] w-full max-w-[794px] border border-line bg-sheet shadow-[0_8px_24px_-12px_rgb(22_24_29/0.25)]" />
            </div>
            <p className="text-sm text-ink-2 md:hidden">Ábrela o descárgala para verla a tamaño real.</p>
          </Cell>
        </Ruled>
      )}
    </>
  );
}

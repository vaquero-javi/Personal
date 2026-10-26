import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import { EmptyNote, Gauge, LimitBar, Panel } from '@/features/home/panels';
import { formatDate, formatEuro, formatQty, formatShortDate, formatTime, percent } from '@/lib/format';
import { homeSummary } from '@/server/queries/home';
import { requireOrg } from '@/server/session';

const priorityDot = { urgent: 'bg-danger', high: 'bg-warning-line', normal: 'bg-shelf-edge', low: 'bg-line' } as const;
const priorityLabel = { urgent: 'Urgente', high: 'Alta', normal: 'Normal', low: 'Baja' } as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function InicioPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { ctx, can } = await requireOrg(slug);
  const home = await homeSummary(ctx);
  const base = `/o/${slug}`;

  const canInvoicing = can('invoicing.read');
  const canInventory = can('inventory.read');
  const canHrAll = can('hr.time.read');

  const selfMissing = home.missing.find((m) => m.userId === ctx.userId);

  // La siguiente acción: lo más urgente que ESTE rol puede resolver.
  const next =
    selfMissing
      ? {
          text: `Tu turno empezó a las ${formatTime(selfMissing.startsAt)} y aún no has fichado la entrada`,
          primary: { label: 'Fichar ahora', href: `${base}/rrhh` },
          secondary: null,
        }
      : canInvoicing && home.rejected
      ? {
          text: `${plural(home.money.fiscal_rejected, 'registro rechazado', 'registros rechazados')} por VeriFactu (${home.rejected.fullNumber})${home.drafts ? ` · ${plural(home.drafts, 'albarán', 'albaranes')} por contabilizar` : ''}`,
          primary: { label: 'Revisar rechazo', href: `${base}/facturacion/${home.rejected.id}` },
          secondary: home.drafts && can('inventory.post') ? { label: 'Ver albaranes', href: `${base}/almacen/albaranes` } : null,
        }
      : can('inventory.post') && home.drafts
        ? {
            text: `${plural(home.drafts, 'albarán espera', 'albaranes esperan')} a ser ${home.drafts === 1 ? 'contabilizado' : 'contabilizados'}`,
            primary: { label: 'Ver albaranes', href: `${base}/almacen/albaranes` },
            secondary: null,
          }
        : canInvoicing && home.money.overdue_count
          ? {
              text: `${plural(home.money.overdue_count, 'factura vencida', 'facturas vencidas')} por ${formatEuro(home.money.overdue_amount)}`,
              primary: { label: 'Ver vencidas', href: `${base}/facturacion?estado=overdue` },
              secondary: null,
            }
          : home.pendingLeaves && can('hr.leave.approve')
            ? {
                text: `${plural(home.pendingLeaves, 'solicitud de ausencia espera', 'solicitudes de ausencia esperan')} tu aprobación`,
                primary: { label: 'Revisar', href: `${base}/rrhh/ausencias` },
                secondary: null,
              }
            : null;

  const collectedPct = percent(home.money.collected, home.money.issued);
  const attendancePct = percent(home.staff.present, Math.max(1, home.staff.staff - home.staff.on_leave));

  return (
    <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-px bg-line md:grid-cols-[repeat(2,minmax(0,1fr))] md:grid-rows-[repeat(6,auto)_1fr] xl:grid-cols-[repeat(4,minmax(0,1fr))] xl:grid-rows-[auto_auto_auto_1fr]">
      {next ? (
        <div className="flex flex-col gap-3 bg-warning-soft px-4 py-3 md:col-span-2 md:flex-row md:items-center md:px-5 xl:col-span-4">
          <p className="text-sm">
            <b>Siguiente:</b> {next.text}
          </p>
          <div className="flex gap-2 md:ml-auto">
            <Link
              href={next.primary.href}
              className="inline-flex h-[34px] items-center rounded-md bg-ink px-4 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-[#2c3038]"
            >
              {next.primary.label}
            </Link>
            {next.secondary && (
              <Link
                href={next.secondary.href}
                className="inline-flex h-[34px] items-center rounded-md border border-shelf-edge bg-sheet px-4 text-sm font-semibold whitespace-nowrap transition-colors hover:bg-sheet-head"
              >
                {next.secondary.label}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 bg-sheet-head px-4 py-3 text-sm md:col-span-2 md:px-5 xl:col-span-4">
          <CircleCheck aria-hidden className="size-4 text-ok" />
          <span>
            <b>Al día.</b> No hay nada urgente en esta sociedad.
          </span>
        </p>
      )}

      {canInvoicing && (
        <>
          <Gauge
            label="Pendiente de cobro"
            value={formatEuro(home.money.pending)}
            detail={
              <>
                {plural(home.money.invoices, 'factura', 'facturas')}
                {home.money.overdue_count > 0 && (
                  <>
                    {' · '}
                    <span className="font-semibold whitespace-nowrap text-danger">
                      {home.money.overdue_count} {home.money.overdue_count === 1 ? 'vencida' : 'vencidas'} · {formatEuro(home.money.overdue_amount)}
                    </span>
                  </>
                )}
              </>
            }
          />
          <Gauge label="Cobrado este mes" value={formatEuro(home.money.collected)} detail={`de ${formatEuro(home.money.issued)} emitido · ${collectedPct} %`}>
            <LimitBar value={collectedPct} tone="ok" label="Cobrado sobre emitido" />
          </Gauge>
          <Gauge label="VeriFactu" value={String(home.money.fiscal_accepted)} detail="registros aceptados este mes">
            <ul className="mt-2 flex justify-end gap-1.5 text-xs">
              <li className={`rounded-full px-2 py-0.5 ${home.money.fiscal_pending ? 'bg-warning-soft font-semibold text-warning ring-1 ring-warning-line' : 'bg-carton text-ink-2'}`}>
                {home.money.fiscal_pending} {home.money.fiscal_pending === 1 ? 'pendiente' : 'pendientes'}
              </li>
              <li className={`rounded-full px-2 py-0.5 ${home.money.fiscal_rejected ? 'bg-danger font-semibold text-white' : 'bg-carton text-ink-2'}`}>
                {home.money.fiscal_rejected} {home.money.fiscal_rejected === 1 ? 'rechazado' : 'rechazados'}
              </li>
            </ul>
          </Gauge>
        </>
      )}
      <Gauge
        label={canHrAll ? 'Fichajes de hoy' : 'Tu fichaje de hoy'}
        value={canHrAll ? `${home.staff.present} / ${home.staff.staff}` : home.staff.present ? 'Fichado' : selfMissing ? 'Sin fichar' : 'Aún no'}
        detail={
          canHrAll ? (
            <>
              {home.missing.length > 0 ? <span className="font-semibold text-danger">{home.missing.length} sin fichar</span> : 'Nadie con turno sin fichar'}
              {home.staff.on_leave > 0 && ` · ${home.staff.on_leave} de ausencia`}
            </>
          ) : selfMissing ? (
            <Link href={`${base}/rrhh`} className="font-semibold text-danger underline-offset-2 hover:underline">
              Turno desde las {formatTime(selfMissing.startsAt)}: fichar ahora
            </Link>
          ) : (
            <Link href={`${base}/rrhh`} className="underline-offset-2 hover:underline">
              Ir a fichar
            </Link>
          )
        }
      >
        {canHrAll && <LimitBar value={attendancePct} tone="neutral" label="Presentes sobre plantilla disponible" />}
      </Gauge>
      {!canInvoicing && (
        <Panel title="Accesos" className="xl:col-span-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <li>
              <Link className="underline-offset-2 hover:underline" href={`${base}/rrhh`}>
                Fichar y ver mis turnos
              </Link>
            </li>
            <li>
              <Link className="underline-offset-2 hover:underline" href={`${base}/rrhh/ausencias`}>
                Solicitar vacaciones
              </Link>
            </li>
            <li>
              <Link className="underline-offset-2 hover:underline" href={`${base}/incidencias/nueva`}>
                Abrir una incidencia
              </Link>
            </li>
          </ul>
        </Panel>
      )}

      {canInvoicing && (
        <Panel title="Facturas vencidas" action={{ label: 'Ver todas', href: `${base}/facturacion?estado=overdue` }} className="md:col-span-2">
          {home.overdue.length === 0 ? (
            <EmptyNote>Ninguna factura vencida. Aquí aparecerán los cobros que pasen de su fecha, del más antiguo al más reciente.</EmptyNote>
          ) : (
            <>
              <ul className="divide-y divide-line-soft text-sm md:hidden">
                {home.overdue.map((invoice) => (
                  <li key={invoice.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2">
                    <Link href={`${base}/facturacion/${invoice.id}`} className="truncate font-medium underline-offset-2 hover:underline">
                      {invoice.customer}
                    </Link>
                    <span className="text-right whitespace-nowrap">{formatEuro(invoice.amount)}</span>
                    <span className="text-ink-3">{invoice.fullNumber}</span>
                    <span className="text-right font-semibold whitespace-nowrap text-danger">{invoice.days} días</span>
                  </li>
                ))}
              </ul>
              <div className="-mx-1 hidden md:block">
                <table className="w-full border-collapse text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-sheet-head text-left text-xs text-ink-3">
                      <th scope="col" className="border-b border-line px-2 py-[7px] font-semibold">Factura</th>
                      <th scope="col" className="border-b border-line px-2 py-[7px] font-semibold">Cliente</th>
                      <th scope="col" className="border-b border-line px-2 py-[7px] font-semibold">Venció</th>
                      <th scope="col" className="border-b border-line px-2 py-[7px] text-right font-semibold">Días</th>
                      <th scope="col" className="border-b border-line px-2 py-[7px] text-right font-semibold">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {home.overdue.map((invoice) => (
                      <tr key={invoice.id} className="relative hover:bg-sheet-head">
                        <td className="border-b border-line-soft px-2 py-[9px] font-medium">
                          <Link href={`${base}/facturacion/${invoice.id}`} className="underline-offset-2 after:absolute after:inset-0 hover:underline">
                            {invoice.fullNumber}
                          </Link>
                        </td>
                        <td className="max-w-48 truncate border-b border-line-soft px-2 py-[9px]">{invoice.customer}</td>
                        <td className="border-b border-line-soft px-2 py-[9px] text-ink-2">{formatDate(invoice.dueDate)}</td>
                        <td className="border-b border-line-soft px-2 py-[9px] text-right font-semibold text-danger">{invoice.days}</td>
                        <td className="border-b border-line-soft px-2 py-[9px] text-right">{formatEuro(invoice.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      )}

      {canInventory && (
        <Panel title="Stock bajo mínimos" action={{ label: home.lowStockCount > 5 ? `Ver ${home.lowStockCount}` : 'Almacén', href: `${base}/almacen?bajo=1` }}>
          {home.lowStock.length === 0 ? (
            <EmptyNote>Todos los artículos están por encima de su mínimo. Ajusta los mínimos en cada artículo del almacén.</EmptyNote>
          ) : (
            <ul className="divide-y divide-line-soft">
              {home.lowStock.map((row) => (
                <li key={`${row.itemId}-${row.warehouse}`} className="py-2">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <Link href={`${base}/almacen/articulos/${row.itemId}`} className="min-w-0 truncate underline-offset-2 hover:underline" title={`${row.item} · ${row.warehouse}`}>
                      {row.item}
                    </Link>
                    <span className="whitespace-nowrap">
                      <b className="text-danger">{formatQty(row.onHand)}</b> / {formatQty(row.minimum)} {row.unit}
                    </span>
                  </div>
                  <LimitBar value={percent(row.onHand, row.minimum)} tone="danger" label={`${row.item}: existencias sobre mínimo`} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Panel title="Incidencias abiertas" action={{ label: home.openIncidents > 0 ? `Ver ${home.openIncidents}` : 'Ver', href: `${base}/incidencias` }}>
        {home.incidents.length === 0 ? (
          <EmptyNote>Sin incidencias abiertas. Clientes, proveedores y empleados pueden abrirlas desde Incidencias.</EmptyNote>
        ) : (
          <ul className="divide-y divide-line-soft text-sm">
            {home.incidents.map((incident) => (
              <li key={incident.id} className="flex items-center gap-2 py-2">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${priorityDot[incident.priority]}`} />
                <span className="sr-only">Prioridad {priorityLabel[incident.priority]}:</span>
                <Link href={`${base}/incidencias/${incident.id}`} className="min-w-0 truncate underline-offset-2 hover:underline">
                  {incident.title}
                </Link>
              </li>
            ))}
            {home.openIncidents > home.incidents.length && <li className="py-2 text-ink-3">+{home.openIncidents - home.incidents.length} más</li>}
          </ul>
        )}
      </Panel>

      {canInvoicing && (
        <Panel title="Próximos 14 días" action={{ label: 'Pendientes', href: `${base}/facturacion?estado=unpaid` }} className="md:col-span-2">
          {home.upcoming.length === 0 ? (
            <EmptyNote>No hay cobros ni pagos previstos en las próximas dos semanas.</EmptyNote>
          ) : (
            <ul className="divide-y divide-line-soft text-sm">
              {home.upcoming.map((row) => (
                <li key={row.id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 py-2 md:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
                  <span className="text-ink-3">{formatShortDate(row.date)}</span>
                  <span className="order-3 col-span-2 min-w-0 md:order-none md:col-span-1 md:truncate">
                    <span className={`mr-2 text-xs font-semibold ${row.kind === 'cobro' ? 'text-ok' : 'text-ink-2'}`}>{row.kind === 'cobro' ? 'Cobro' : 'Pago'}</span>
                    <Link href={`${base}/${row.kind === 'cobro' ? 'facturacion' : 'compras/facturas'}/${row.id}`} className="underline-offset-2 hover:underline">
                      {row.party}
                    </Link>{' '}
                    <span className="text-ink-3">· {row.document}</span>
                  </span>
                  <span className={`order-2 text-right whitespace-nowrap md:order-none ${row.kind === 'pago' ? 'text-ink-2' : 'font-semibold'}`}>
                    {row.kind === 'pago' ? '−' : '+'}
                    {formatEuro(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {canHrAll && (
        <Panel title="Sin fichar hoy" action={{ label: 'Registro', href: `${base}/rrhh/registro` }}>
          {home.missing.length === 0 ? (
            <EmptyNote>Todo el personal con turno ya empezado ha fichado su entrada.</EmptyNote>
          ) : (
            <ul className="divide-y divide-line-soft text-sm">
              {home.missing.map((person) => (
                <li key={person.name} className="flex justify-between gap-3 py-2">
                  <span>{person.name}</span>
                  <span className="text-ink-3">
                    {person.area ? `${person.area} · ` : ''}
                    {formatTime(person.startsAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {canInventory && (
        <Panel title="Albaranes en borrador" action={{ label: 'Almacén', href: `${base}/almacen/albaranes` }}>
          {home.drafts === 0 ? (
            <EmptyNote>Todas las entradas de mercancía están contabilizadas.</EmptyNote>
          ) : (
            <p className="text-sm text-ink-2">
              <b className="text-2xl text-ink">{home.drafts}</b> {home.drafts === 1 ? 'borrador espera' : 'borradores esperan'} a que alguien con permiso de almacén
              {home.drafts === 1 ? ' lo' : ' los'} contabilice. Hasta entonces no suman stock.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

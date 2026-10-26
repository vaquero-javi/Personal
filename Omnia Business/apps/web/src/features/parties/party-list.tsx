import { Cell, EmptyState, PageHeader } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { inputClass } from '@/components/ui/form';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { formatDate, formatEuro } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

/** Listado de clientes o proveedores (lo usan Ventas y Compras). */
export async function PartyList({ org, role, base, q }: { org: string; role: 'customer' | 'supplier'; base: string; q?: string | undefined }) {
  const { ctx, can } = await requireOrg(org);
  const parties = await container().parties.list(ctx, { role, ...(q ? { search: q } : {}) });
  const noun = role === 'customer' ? 'clientes' : 'proveedores';
  return (
    <>
      <PageHeader
        title={role === 'customer' ? 'Clientes' : 'Proveedores'}
        description={`${parties.length} ${noun}`}
        actions={can('parties.write') && <LinkButton href={`${base}/nuevo`} variant="primary">{role === 'customer' ? 'Nuevo cliente' : 'Nuevo proveedor'}</LinkButton>}
      />
      <Cell>
        <form className="mb-3 flex max-w-md gap-2" role="search">
          <label htmlFor="q" className="sr-only">Buscar</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nombre o NIF" className={inputClass} />
        </form>
        {parties.length === 0 ? (
          <EmptyState title={q ? 'Sin resultados' : `Aún no hay ${noun}`}>{q ? 'Prueba con otro nombre o NIF.' : `Da de alta tus ${noun} para usarlos en pedidos y facturas.`}</EmptyState>
        ) : (
          <Table minWidth={680}>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>NIF</Th>
                <Th>Contacto</Th>
                <Th>Última factura</Th>
                <Th align="right">{role === 'customer' ? 'Pendiente de cobro' : 'Pendiente de pago'}</Th>
              </tr>
            </thead>
            <tbody>
              {parties.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <RowLink href={`${base}/${p.id}`}>{p.legalName}</RowLink>
                    {p.priceListName && <span className="block text-xs text-ink-3">Tarifa {p.priceListName}</span>}
                  </Td>
                  <Td className="text-ink-2">{p.taxId ?? '—'}</Td>
                  <Td className="text-ink-2">{p.email ?? p.phone ?? '—'}</Td>
                  <Td className="text-ink-2">{formatDate(p.lastActivity)}</Td>
                  <Td align="right" className={Number(p.outstanding) > 0 ? 'font-semibold' : 'text-ink-3'}>{formatEuro(p.outstanding)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Cell>
    </>
  );
}

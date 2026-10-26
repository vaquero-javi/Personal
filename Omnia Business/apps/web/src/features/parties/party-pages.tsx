import { Cell, EmptyState, PageHeader, Ruled, StatusBadge } from '@/components/ui/layout';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { PartyForm } from './party-form';
import { formatDate, formatEuro } from '@/lib/format';
import { invoiceStatus, receivedInvoiceStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { saveParty } from '@/server/party-actions';
import { requireOrg, requirePermission } from '@/server/session';

export async function NewPartyPage({ org, role, base }: { org: string; role: 'customer' | 'supplier'; base: string }) {
  const { ctx } = await requirePermission(org, 'parties.write');
  const priceLists = await container().parties.priceLists(ctx);
  return (
    <>
      <PageHeader title={role === 'customer' ? 'Nuevo cliente' : 'Nuevo proveedor'} back={{ href: base, label: role === 'customer' ? 'Clientes' : 'Proveedores' }} />
      <Cell>
        <div className="max-w-4xl">
          <PartyForm action={saveParty.bind(null, org, null, base)} role={role} priceLists={priceLists.map((p) => ({ value: p.id, label: p.name }))} />
        </div>
      </Cell>
    </>
  );
}

export async function PartyDetailPage({ org, id, role, base }: { org: string; id: string; role: 'customer' | 'supplier'; base: string }) {
  const { ctx, can } = await requireOrg(org);
  const direction = role === 'customer' ? 'issued' : 'received';
  const [party, priceLists, invoices] = await Promise.all([
    container().parties.get(ctx, id),
    container().parties.priceLists(ctx),
    can('invoicing.read') ? container().invoicing.list(ctx, { direction, partyId: id }) : Promise.resolve([]),
  ]);
  const own = invoices.slice(0, 20);
  const invoiceBase = role === 'customer' ? `/o/${org}/facturacion` : `/o/${org}/compras/facturas`;
  return (
    <>
      <PageHeader title={party.legalName} description={[party.taxId, party.email, party.phone].filter(Boolean).join(' · ')} back={{ href: base, label: role === 'customer' ? 'Clientes' : 'Proveedores' }} />
      <Ruled cols="xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Cell title="Ficha">
          {can('parties.write') ? (
            <PartyForm action={saveParty.bind(null, org, party.id, base)} party={party} role={role} priceLists={priceLists.map((p) => ({ value: p.id, label: p.name }))} />
          ) : (
            <p className="text-sm text-ink-2">Solo lectura.</p>
          )}
        </Cell>
        <Cell title={role === 'customer' ? 'Facturas emitidas' : 'Facturas recibidas'}>
          {own.length === 0 ? (
            <EmptyState title="Sin facturas todavía" />
          ) : (
            <Table minWidth={420}>
              <thead>
                <tr>
                  <Th>Factura</Th>
                  <Th>Fecha</Th>
                  <Th align="right">Total</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {own.map((i) => (
                  <Tr key={i.id}>
                    <Td><RowLink href={`${invoiceBase}/${i.id}`}>{i.fullNumber ?? 'Borrador'}</RowLink></Td>
                    <Td className="text-ink-2">{formatDate(i.issueDate)}</Td>
                    <Td align="right">{formatEuro(i.total)}</Td>
                    <Td><StatusBadge map={role === 'customer' ? invoiceStatus : receivedInvoiceStatus} value={i.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Cell>
      </Ruled>
    </>
  );
}

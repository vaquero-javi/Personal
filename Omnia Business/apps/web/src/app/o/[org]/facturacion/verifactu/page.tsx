import { Cell, EmptyState, PageHeader, StatusBadge } from '@/components/ui/layout';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { Notice } from '@/components/ui/form';
import { formatDateTime, formatEuro } from '@/lib/format';
import { fiscalStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Registros VeriFactu · Omnia' };

export default async function VerifactuPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requireOrg(org);
  const records = await container().invoicing.fiscalRecords(ctx);
  const rejected = records.filter((r) => r.fiscalStatus === 'rejected').length;
  const pending = records.filter((r) => r.fiscalStatus === 'pending').length;
  return (
    <>
      <PageHeader title="Registros VeriFactu" description="Cada factura emitida genera un registro con su huella encadenada a la anterior." />
      <Cell>
        <Notice tone="warning">
          El envío a la AEAT lo hará un proceso en segundo plano que aún no está conectado: hoy {pending} {pending === 1 ? 'registro espera' : 'registros esperan'} en la cola.
          {rejected > 0 && ` ${rejected} ${rejected === 1 ? 'fue rechazado' : 'fueron rechazados'} y necesita${rejected === 1 ? '' : 'n'} revisión.`}
        </Notice>
        {records.length === 0 ? (
          <EmptyState title="Aún no hay registros">Se crean al emitir la primera factura.</EmptyState>
        ) : (
          <Table minWidth={880}>
            <thead>
              <tr>
                <Th>Factura</Th>
                <Th>Generado</Th>
                <Th>Huella</Th>
                <Th align="right">Total</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <RowLink href={`/o/${org}/facturacion/${r.id}`}>{r.fullNumber}</RowLink>
                    <span className="block text-xs text-ink-3">{r.partyName ?? 'Cliente de mostrador'}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-2">{formatDateTime(r.fiscalRecordAt)}</Td>
                  <Td>
                    <code className="text-xs text-ink-2" title={r.fiscalRecordHash}>{r.fiscalRecordHash.slice(0, 16)}…</code>
                  </Td>
                  <Td align="right">{formatEuro(r.total)}</Td>
                  <Td>
                    <StatusBadge map={fiscalStatus} value={r.fiscalStatus} />
                    {r.fiscalResponse?.message && <span className="mt-1 block max-w-64 text-xs text-danger">{r.fiscalResponse.message}</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Cell>
    </>
  );
}

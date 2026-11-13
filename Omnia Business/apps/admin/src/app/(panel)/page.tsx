import { Check } from 'lucide-react';
import { Badge, PageHeader, RowLink, Table, Td, Th, Tr } from '@/components/ui';
import { container } from '@/server/container';
import { requireAdmin } from '@/server/session';

export const metadata = { title: 'Sociedades · Equipo Omnia' };

/** Todas las sociedades × módulos de pago, de un vistazo. Cada fila abre la matriz editable. */
export default async function AdminOrganizationsPage() {
  // Next pinta layout y página en paralelo: la página también exige el equipo.
  const { userId } = await requireAdmin();
  const [organizations, catalog] = await Promise.all([container().entitlements.adminOrganizations(userId), container().entitlements.catalog()]);
  const paid = catalog.filter((f) => !f.isCore);
  const pending = organizations.reduce((n, o) => n + o.pendingRequests, 0);

  return (
    <>
      <PageHeader
        title="Sociedades"
        description={`${organizations.length} ${organizations.length === 1 ? 'sociedad' : 'sociedades'}${pending ? ` · ${pending} ${pending === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}` : ''}. La base (${catalog
          .filter((f) => f.isCore)
          .map((f) => f.name.toLowerCase())
          .join(', ')}) va siempre incluida.`}
      />
      <section className="min-w-0 rounded-[var(--radius-card)] bg-sheet px-4 py-4 shadow-[var(--shadow-card)] md:px-5">
        <Table minWidth={280 + paid.length * 92}>
          <thead>
            <tr>
              <Th>Sociedad</Th>
              {paid.map((f) => (
                <Th key={f.code} align="center" className="!whitespace-normal leading-tight">
                  <span className="block min-w-[72px]">{f.name}</span>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {organizations.length === 0 && (
              <tr>
                <td colSpan={paid.length + 1} className="px-5 py-10 text-center text-[14px] text-ink-3">Aún no hay sociedades en Omnia.</td>
              </tr>
            )}
            {organizations.map((o) => {
              const active = new Set(o.activeFeatures);
              return (
                <Tr key={o.id}>
                  <Td>
                    <span className="flex flex-col">
                      <RowLink href={`/sociedades/${o.id}`}>{o.tradeName ?? o.legalName}</RowLink>
                      <span className="text-[12px] text-ink-3">
                        {o.taxId} · {o.memberCount} {o.memberCount === 1 ? 'persona' : 'personas'}
                      </span>
                      {o.pendingRequests > 0 && (
                        <span className="mt-1">
                          <Badge tone="info">
                            {o.pendingRequests} {o.pendingRequests === 1 ? 'solicitud' : 'solicitudes'}
                          </Badge>
                        </span>
                      )}
                    </span>
                  </Td>
                  {paid.map((f) => (
                    <Td key={f.code} align="center">
                      {active.has(f.code) ? (
                        <Check aria-label="Activo" className="mx-auto size-[18px] text-ok" strokeWidth={2.6} />
                      ) : (
                        <span aria-label="No activo" className="text-ink-3">·</span>
                      )}
                    </Td>
                  ))}
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </section>
    </>
  );
}

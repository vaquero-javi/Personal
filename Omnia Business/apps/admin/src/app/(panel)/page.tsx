import Link from 'next/link';
import { Check } from 'lucide-react';
import { Badge, PageHeader, RowLink, Table, Td, Th, Tr } from '@/components/ui';
import { container } from '@/server/container';
import { requireAdmin } from '@/server/session';

export const metadata = { title: 'Sociedades · Equipo Omnia' };

/** Todas las sociedades × módulos principales, de un vistazo. Cada fila abre la matriz editable. */
/** Minúsculas y sin acentos ni signos: «Café Ñandú, S.L.» → «cafe nandu sl». */
const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export default async function AdminOrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  // Next pinta layout y página en paralelo: la página también exige el equipo.
  const { userId } = await requireAdmin();
  const [organizations, catalog] = await Promise.all([container().entitlements.adminOrganizations(userId), container().entitlements.catalog()]);
  // Solo los módulos principales: los submódulos se ven y se cambian dentro de cada sociedad.
  const paid = catalog.filter((f) => !f.parentCode);
  const pending = organizations.reduce((n, o) => n + o.pendingRequests, 0);

  // Búsqueda (?q=): cada palabra tiene que aparecer en el nombre comercial, la razón social, el CIF o el identificador.
  const rawQ = (await searchParams).q;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim().slice(0, 100) ?? '';
  const words = normalize(q).split(' ').filter(Boolean);
  const shown = words.length
    ? organizations.filter((o) => {
        const haystack = normalize([o.tradeName, o.legalName, o.taxId, o.slug].filter(Boolean).join(' '));
        // Sin espacios también: «sl» encuentra «S.L.» y «b1234» encuentra «B-1234…».
        const compact = haystack.replace(/ /g, '');
        return words.every((w) => haystack.includes(w) || compact.includes(w));
      })
    : organizations;

  return (
    <>
      <PageHeader
        title="Sociedades"
        description={q ? `${shown.length} de ${organizations.length} ${organizations.length === 1 ? 'sociedad' : 'sociedades'} para «${q}».` : `${organizations.length} ${organizations.length === 1 ? 'sociedad' : 'sociedades'}${pending ? ` · ${pending} ${pending === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}` : ''}. Abre una sociedad para dar o quitar cada módulo y submódulo.`}
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
            {shown.length === 0 && (
              <tr>
                <td colSpan={paid.length + 1} className="px-5 py-10 text-center text-[14px] text-ink-3">
                  {q ? (
                    <>
                      Ninguna sociedad coincide con «{q}».{' '}
                      <Link href="/" className="text-tint underline-offset-2 hover:underline">
                        Ver todas
                      </Link>
                    </>
                  ) : (
                    'Aún no hay sociedades en Omnia.'
                  )}
                </td>
              </tr>
            )}
            {shown.map((o) => {
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

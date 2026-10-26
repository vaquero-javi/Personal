import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { Cell, EmptyState, PageHeader, StatusBadge } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { inputClass } from '@/components/ui/form';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { incidentPriority, incidentStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Incidencias · Omnia' };

const FILTERS = [
  { value: 'active', label: 'Abiertas' },
  { value: 'mine', label: 'Mías' },
  { value: 'resolved', label: 'Resueltas' },
  { value: 'all', label: 'Todas' },
];

export default async function IncidentsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ ver?: string; q?: string }> }) {
  const { org } = await params;
  const { ver = 'active', q } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const incidents = await container().incidents.list(ctx, {
    status: ver === 'mine' ? 'active' : ver,
    mine: ver === 'mine',
    ...(q ? { search: q } : {}),
  });
  const base = `/o/${org}/incidencias`;
  return (
    <>
      <PageHeader
        title="Incidencias"
        description="Reportes de clientes, proveedores y empleados, ordenados por prioridad."
        actions={can('incidents.write') && <LinkButton href={`${base}/nueva`} variant="primary">Abrir incidencia</LinkButton>}
      />
      <Cell>
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center">
          <nav aria-label="Filtro" className="flex flex-wrap gap-2 text-sm">
            {FILTERS.map((f) => (
              <Link key={f.value} href={`${base}?ver=${f.value}`} aria-current={ver === f.value ? 'true' : undefined} className="rounded-full border border-line px-3 py-1 aria-[current]:border-ink aria-[current]:bg-ink aria-[current]:text-white">
                {f.label}
              </Link>
            ))}
          </nav>
          <form role="search" className="md:ml-auto md:w-72">
            <input type="hidden" name="ver" value={ver} />
            <label htmlFor="q" className="sr-only">Buscar incidencia</label>
            <input id="q" name="q" type="search" defaultValue={q} placeholder="Título o número" className={inputClass} />
          </form>
        </div>
        {incidents.length === 0 ? (
          <EmptyState title={ver === 'active' ? 'No hay incidencias abiertas' : 'Nada con este filtro'}>Cualquiera con permiso puede abrir una incidencia y asignarla.</EmptyState>
        ) : (
          <Table minWidth={860}>
            <thead>
              <tr>
                <Th>Nº</Th>
                <Th>Incidencia</Th>
                <Th>Sobre</Th>
                <Th>Asignada a</Th>
                <Th>Abierta</Th>
                <Th>Prioridad</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <Tr key={i.id}>
                  <Td className="text-ink-3">#{i.number}</Td>
                  <Td>
                    <RowLink href={`${base}/${i.id}`}>{i.title}</RowLink>
                    <span className="flex items-center gap-2 text-xs text-ink-3">
                      {i.category}
                      {i.commentCount > 0 && (
                        <span className="inline-flex items-center gap-0.5"><MessageSquare aria-hidden className="size-3" />{i.commentCount}</span>
                      )}
                    </span>
                  </Td>
                  <Td className="text-ink-2">{i.subjectName ?? '—'}</Td>
                  <Td className="text-ink-2">{i.assigneeName ?? 'Sin asignar'}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{formatDateTime(i.createdAt)}</Td>
                  <Td><StatusBadge map={incidentPriority} value={i.priority} /></Td>
                  <Td><StatusBadge map={incidentStatus} value={i.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Cell>
    </>
  );
}

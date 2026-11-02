import Link from 'next/link';
import { Cell, EmptyState, PageHeader, StatusBadge } from '@/components/ui/layout';
import { LinkButton } from '@/components/ui/button';
import { inputClass } from '@/components/ui/form';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { TaskStatusButtons } from '@/features/tasks/task-status-buttons';
import { formatDate } from '@/lib/format';
import { taskStatus } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';

export const metadata = { title: 'Tareas · Omnia' };

const FILTERS = [
  { value: 'open', label: 'Por hacer' },
  { value: 'done', label: 'Hechas' },
  { value: 'all', label: 'Todas' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

export default async function TasksPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ ver?: string; persona?: string }> }) {
  const { org } = await params;
  const { ver: rawVer, persona } = await searchParams;
  const ver: Filter = FILTERS.some((f) => f.value === rawVer) ? (rawVer as Filter) : 'open';
  const { ctx, can } = await requireOrg(org);
  const manager = can('tasks.manage');
  const [tasks, people] = await Promise.all([
    container().tasks.list(ctx, { status: ver, ...(manager && persona ? { assignee: persona } : {}) }),
    manager ? container().hr.people(ctx) : Promise.resolve([]),
  ]);
  const base = `/o/${org}/tareas`;
  const today = new Date().toISOString().slice(0, 10);
  const query = (v: string) => `${base}?ver=${v}${manager && persona ? `&persona=${persona}` : ''}`;

  return (
    <>
      <PageHeader
        title="Tareas"
        description={manager ? 'Las tareas que mandan los responsables a cada persona. Tú ves las de todos.' : 'Lo que te han mandado hacer. Márcalo cuando lo empieces y cuando esté hecho.'}
        actions={manager && <LinkButton href={`${base}/nueva`} variant="primary">Nueva tarea</LinkButton>}
      />
      <Cell>
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center">
          <nav aria-label="Filtro" className="flex flex-wrap gap-2 text-sm">
            {FILTERS.map((f) => (
              <Link key={f.value} href={query(f.value)} aria-current={ver === f.value ? 'true' : undefined} className="rounded-full border border-line px-3 py-1 aria-[current]:border-ink aria-[current]:bg-ink aria-[current]:text-white">
                {f.label}
              </Link>
            ))}
          </nav>
          {manager && (
            <form className="flex items-center gap-2 md:ml-auto md:w-72">
              <input type="hidden" name="ver" value={ver} />
              <label htmlFor="persona" className="sr-only">Persona</label>
              <select id="persona" name="persona" defaultValue={persona ?? ''} className={inputClass}>
                <option value="">Todas las personas</option>
                {people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
              </select>
              <button type="submit" className="h-[34px] rounded-md border border-shelf-edge px-3 text-sm font-semibold hover:bg-sheet-head">Ver</button>
            </form>
          )}
        </div>
        {tasks.length === 0 ? (
          <EmptyState title={ver === 'open' ? (manager ? 'No hay tareas por hacer' : 'No tienes tareas pendientes') : 'Nada con este filtro'}>
            {manager ? 'Manda una con «Nueva tarea»: solo la verá la persona a la que se la asignes.' : 'Cuando un responsable te mande una tarea, aparecerá aquí.'}
          </EmptyState>
        ) : (
          <Table minWidth={manager ? 860 : 640}>
            <thead>
              <tr>
                <Th>Tarea</Th>
                {manager && <Th>Para</Th>}
                <Th>Mandada por</Th>
                <Th>Fecha límite</Th>
                <Th>Estado</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const late = t.status !== 'done' && t.dueDate !== null && t.dueDate < today;
                return (
                  <Tr key={t.id}>
                    <Td>
                      <RowLink href={`${base}/${t.id}`}>{t.title}</RowLink>
                      {t.description && <span className="block max-w-md truncate text-xs text-ink-3">{t.description}</span>}
                    </Td>
                    {manager && <Td className="text-ink-2">{t.assigneeName}</Td>}
                    <Td className="text-ink-2">{t.assignedByName}</Td>
                    <Td className={`whitespace-nowrap ${late ? 'font-semibold text-danger' : 'text-ink-2'}`}>
                      {t.dueDate ? formatDate(t.dueDate) : '—'}
                      {late && <span className="block text-xs">Vencida</span>}
                    </Td>
                    <Td><StatusBadge map={taskStatus} value={t.status} /></Td>
                    <Td>
                      {(t.assigneeUserId === ctx.userId || manager) && (
                        <div className="relative z-10">
                          <TaskStatusButtons org={org} id={t.id} status={t.status} />
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Cell>
    </>
  );
}

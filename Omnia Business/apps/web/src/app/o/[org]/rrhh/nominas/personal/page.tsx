import { redirect } from 'next/navigation';
import { Badge, Cell, EmptyState, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/button-styles';
import { formatDateTime, formatEuro, formatMonth, todayIso } from '@/lib/format';
import { payslipKind } from '@/lib/labels';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { deletePayslip, uploadPayslip } from '../../actions';

export const metadata = { title: 'Nóminas del personal · Omnia' };

const KINDS = Object.entries(payslipKind).map(([value, label]) => ({ value, label }));

/** Mes que se suele estar pagando (AAAA-MM): el actual a partir del día 20, si no el anterior. */
const payrollMonth = () => {
  const [y, m, d] = todayIso().split('-').map(Number) as [number, number, number];
  if (d >= 20) return `${y}-${String(m).padStart(2, '0')}`;
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

export default async function StaffPayslipsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ persona?: string }> }) {
  const { org } = await params;
  const { persona } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  if (!can('hr.payroll.manage')) redirect(`/o/${org}/rrhh/nominas`);

  const svc = container().payroll;
  const [employees, all] = await Promise.all([svc.employees(ctx), svc.all(ctx)]);
  const selected = employees.find((e) => e.userId === persona);
  const payslips = selected ? all.filter((p) => p.userId === selected.userId) : all;
  const file = (id: string) => `/o/${org}/rrhh/nominas/${id}/archivo`;

  // Quién no tiene aún la nómina ordinaria del último mes subido.
  const lastPeriod = all.filter((p) => p.kind === 'monthly').map((p) => p.period).sort().at(-1);
  const missing = lastPeriod
    ? employees.filter((e) => e.status !== 'suspended' && !all.some((p) => p.userId === e.userId && p.period === lastPeriod && p.kind === 'monthly'))
    : [];

  const options = employees
    .filter((e) => e.status !== 'suspended')
    .map((e) => ({
      value: e.userId,
      label: `${e.name}${e.employeeCode ? ` (${e.employeeCode})` : ''} · ${e.email}${e.status === 'invited' ? ' · invitación pendiente' : ''}`,
    }));

  return (
    <>
      <PageHeader
        title="Nóminas del personal"
        description="Sube la nómina de cada persona. La verá al entrar con su cuenta (el correo que aparece junto a su nombre), en «Mis nóminas»; nadie más del equipo tiene acceso."
      />
      <Ruled cols="xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell
          title={selected ? `Nóminas de ${selected.name}` : 'Todas las nóminas'}
          actions={
            <form className="flex items-center gap-2">
              <label htmlFor="persona" className="sr-only">Persona</label>
              <select id="persona" name="persona" defaultValue={selected?.userId ?? ''} className="h-8 max-w-56 rounded-md border border-shelf-edge bg-sheet px-2 text-sm">
                <option value="">Todo el personal</option>
                {employees.map((e) => (
                  <option key={e.userId} value={e.userId}>{e.name}</option>
                ))}
              </select>
              <button type="submit" className={buttonClass('secondary', 'h-8 px-3')}>Filtrar</button>
            </form>
          }
        >
          {payslips.length === 0 ? (
            <EmptyState title={selected ? `${selected.name} aún no tiene nóminas` : 'Aún no has subido ninguna nómina'}>
              Sube la primera con el formulario: elige a la persona, el mes y el PDF que te ha pasado la gestoría.
            </EmptyState>
          ) : (
            <Table minWidth={760}>
              <thead>
                <tr>
                  <Th>Persona</Th>
                  <Th>Mes</Th>
                  <Th>Concepto</Th>
                  <Th align="right">Líquido</Th>
                  <Th>Leída</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <span className="font-medium">{p.userName}</span>
                      <span className="block text-xs text-ink-3">{p.userEmail}</span>
                    </Td>
                    <Td>
                      <a href={file(p.id)} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{formatMonth(p.period)}</a>
                    </Td>
                    <Td className="text-ink-2">{payslipKind[p.kind]}</Td>
                    <Td align="right">{p.netAmount ? formatEuro(p.netAmount) : '—'}</Td>
                    <Td>
                      {p.viewedAt ? (
                        <span className="text-sm text-ink-2">{formatDateTime(p.viewedAt)}</span>
                      ) : (
                        <Badge tone="muted">Sin abrir</Badge>
                      )}
                    </Td>
                    <Td>
                      <ActionForm action={deletePayslip.bind(null, org, p.id)}>
                        <SubmitButton variant="ghost" className="h-8 px-2" pendingLabel="Borrando…" aria-label={`Borrar la nómina de ${formatMonth(p.period)} de ${p.userName}`}>
                          Borrar
                        </SubmitButton>
                      </ActionForm>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Cell>
        <Cell title="Subir nómina">
          <ActionForm action={uploadPayslip.bind(null, org)} className="flex flex-col gap-3" resetOnSuccess>
            <SelectField label="Persona" name="userId" options={options} placeholder="Elige…" required defaultValue={selected?.userId ?? ''} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Mes" name="period" type="month" required defaultValue={payrollMonth()} />
              <SelectField label="Concepto" name="kind" options={KINDS} defaultValue="monthly" />
            </div>
            <TextField label="Líquido a percibir" name="netAmount" inputMode="decimal" placeholder="Opcional" hint="El importe neto que se ingresa; sirve para el total del año" />
            <TextField label="Nómina en PDF" name="file" type="file" accept="application/pdf,image/jpeg,image/png" required hint="PDF (o foto JPG/PNG) · hasta 7 MB" />
            <div>
              <SubmitButton pendingLabel="Subiendo…">Subir nómina</SubmitButton>
            </div>
          </ActionForm>
          {lastPeriod && (
            <div className="mt-5 border-t border-line pt-4 text-sm">
              <h4 className="mb-2 font-bold">{formatMonth(lastPeriod)}</h4>
              {missing.length === 0 ? (
                <p className="text-ink-2">Todo el personal tiene ya su nómina de este mes.</p>
              ) : (
                <>
                  <p className="mb-2 text-ink-2">Falta la nómina de {missing.length === 1 ? 'una persona' : `${missing.length} personas`}:</p>
                  <ul className="flex flex-col gap-1">
                    {missing.map((e) => (
                      <li key={e.userId}>{e.name}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </Cell>
      </Ruled>
    </>
  );
}

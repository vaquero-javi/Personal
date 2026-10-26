import { Badge, Cell, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { createSeries } from '../actions';

export const metadata = { title: 'Series de facturación · Omnia' };

const KIND = { standard: 'Facturas', simplified: 'Simplificadas (tickets)', rectifying: 'Rectificativas' } as const;

export default async function SeriesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const series = await container().invoicing.series(ctx);
  const year = new Date().getFullYear();
  return (
    <>
      <PageHeader title="Series" description="Cada serie numera sin huecos dentro de su ejercicio. Una serie por tipo de documento y año." />
      <Ruled cols="lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell>
          <Table minWidth={520}>
            <thead>
              <tr>
                <Th>Serie</Th>
                <Th>Tipo</Th>
                <Th align="right">Ejercicio</Th>
                <Th align="right">Siguiente nº</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-semibold">
                    {s.code}
                    {s.description && <span className="block text-xs font-normal text-ink-3">{s.description}</span>}
                  </Td>
                  <Td className="text-ink-2">{KIND[s.invoiceKind]}</Td>
                  <Td align="right">{s.fiscalYear}</Td>
                  <Td align="right">{s.nextNumber}</Td>
                  <Td>{s.fiscalYear === year && <Badge tone="ok">En uso</Badge>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Cell>
        <Cell title="Nueva serie">
          {can('invoicing.issue') ? (
            <ActionForm action={createSeries.bind(null, org)} className="flex flex-col gap-4" resetOnSuccess>
              <TextField label="Código" name="code" required maxLength={10} placeholder="B" hint="Letras y números; aparece en el número: B-2026-000001" />
              <SelectField label="Tipo" name="invoiceKind" options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} />
              <TextField label="Ejercicio" name="fiscalYear" inputMode="numeric" defaultValue={String(year)} required />
              <TextField label="Descripción" name="description" placeholder="Opcional" />
              <div>
                <SubmitButton>Crear serie</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-2">Tu rol no puede gestionar series.</p>
          )}
        </Cell>
      </Ruled>
    </>
  );
}

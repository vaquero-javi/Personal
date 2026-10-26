import { Badge, Cell, PageHeader, Ruled } from '@/components/ui/layout';
import { RowLink, Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, CheckboxField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { createPriceList } from '../actions';

export const metadata = { title: 'Tarifas · Omnia' };

export default async function PriceListsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const lists = await container().parties.priceLists(ctx);
  return (
    <>
      <PageHeader title="Tarifas" description="Cada cliente compra con su tarifa; si no tiene, con la tarifa por defecto (también la del TPV)." />
      <Ruled cols="lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell>
          <Table minWidth={420}>
            <thead>
              <tr>
                <Th>Tarifa</Th>
                <Th align="right">Artículos con precio</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {lists.map((l) => (
                <Tr key={l.id}>
                  <Td>
                    <RowLink href={`/o/${org}/ventas/tarifas/${l.id}`}>{l.name}</RowLink>
                    <span className="block text-xs text-ink-3">{l.code}</span>
                  </Td>
                  <Td align="right">{l.itemCount}</Td>
                  <Td>{l.isDefault && <Badge tone="info">Por defecto</Badge>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Cell>
        <Cell title="Nueva tarifa">
          {can('parties.write') ? (
            <ActionForm action={createPriceList.bind(null, org)} className="flex flex-col gap-4" resetOnSuccess>
              <TextField label="Código" name="code" required maxLength={20} placeholder="MAY" />
              <TextField label="Nombre" name="name" required placeholder="Mayoristas" />
              <CheckboxField label="Usar como tarifa por defecto" name="isDefault" />
              <div>
                <SubmitButton>Crear tarifa</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-2">Tu rol no puede gestionar tarifas.</p>
          )}
        </Cell>
      </Ruled>
    </>
  );
}

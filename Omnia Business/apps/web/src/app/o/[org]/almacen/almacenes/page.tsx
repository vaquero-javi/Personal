import { Cell, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { formatEuro } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { createWarehouse } from '../actions';

export const metadata = { title: 'Almacenes · Omnia' };

export default async function WarehousesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const warehouses = await container().warehouse.warehouses(ctx);
  return (
    <>
      <PageHeader title="Almacenes" description="Cada almacén lleva su propio saldo, mínimo y coste medio por artículo." />
      <Ruled cols="lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell>
          <Table minWidth={520}>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Nombre</Th>
                <Th align="right">Artículos con stock</Th>
                <Th align="right">Valor</Th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((w) => (
                <Tr key={w.id}>
                  <Td className="font-semibold">{w.code}</Td>
                  <Td>
                    <a href={`/o/${org}/almacen?almacen=${w.id}`} className="underline-offset-2 hover:underline">{w.name}</a>
                  </Td>
                  <Td align="right">{w.itemCount}</Td>
                  <Td align="right">{formatEuro(w.stockValue)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Cell>
        <Cell title="Nuevo almacén">
          {can('inventory.write') ? (
            <ActionForm action={createWarehouse.bind(null, org)} className="flex flex-col gap-4" resetOnSuccess>
              <TextField label="Código" name="code" required maxLength={10} placeholder="N3" />
              <TextField label="Nombre" name="name" required placeholder="Nave 3" />
              <div>
                <SubmitButton>Crear almacén</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-2">Tu rol no puede crear almacenes.</p>
          )}
        </Cell>
      </Ruled>
    </>
  );
}

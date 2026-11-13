import { Cell, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, SelectField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { formatEuro } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { createWarehouse, setWarehouseEstablishment } from '../actions';

export const metadata = { title: 'Almacenes · Omnia' };

export default async function WarehousesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can, org: membership } = await requireOrg(org);
  const [warehouses, establishments] = await Promise.all([
    container().warehouse.warehouses(ctx),
    membership.kind === 'company' ? container().organizations.establishments(ctx) : Promise.resolve([]),
  ]);
  const options = establishments.filter((e) => e.isActive).map((e) => ({ value: e.id, label: e.name }));
  const editable = can('inventory.write');
  return (
    <>
      <PageHeader
        title="Almacenes"
        description="Cada almacén lleva su propio saldo, mínimo y coste medio por artículo. Asígnalo a una empresa (negocio o local) para separar el stock y el TPV de cada una."
      />
      <Ruled cols="lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cell>
          <Table minWidth={options.length ? 760 : 520}>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Nombre</Th>
                {(options.length > 0 || warehouses.some((w) => w.establishmentName)) && <Th>Empresa</Th>}
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
                  {(options.length > 0 || warehouses.some((x) => x.establishmentName)) && (
                    <Td>
                      {editable && options.length > 0 ? (
                        <ActionForm action={setWarehouseEstablishment.bind(null, org, w.id)} className="flex items-center gap-2">
                          <select
                            name="establishmentId"
                            defaultValue={w.establishmentId ?? ''}
                            aria-label={`Empresa del almacén ${w.name}`}
                            className="h-8 max-w-[12rem] rounded-[9px] bg-fill px-2 text-[14px] focus:ring-[3px] focus:ring-tint/40 focus:outline-none"
                          >
                            <option value="">Sin empresa</option>
                            {options.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <SubmitButton variant="secondary" className="!h-8 !px-3 !text-[13px]">Guardar</SubmitButton>
                        </ActionForm>
                      ) : (
                        <span className={w.establishmentName ? '' : 'text-ink-3'}>{w.establishmentName ?? 'Sin empresa'}</span>
                      )}
                    </Td>
                  )}
                  <Td align="right">{w.itemCount}</Td>
                  <Td align="right">{formatEuro(w.stockValue)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Cell>
        <Cell title="Nuevo almacén">
          {editable ? (
            <ActionForm action={createWarehouse.bind(null, org)} className="flex flex-col gap-4" resetOnSuccess>
              <TextField label="Código" name="code" required maxLength={10} placeholder="N3" />
              <TextField label="Nombre" name="name" required placeholder="Nave 3" />
              {options.length > 0 && <SelectField label="Empresa" name="establishmentId" placeholder="Sin empresa" options={options} />}
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

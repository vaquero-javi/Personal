import { Cell, PageHeader } from '@/components/ui/layout';
import { ItemForm } from '@/features/inventory/item-form';
import { container } from '@/server/container';
import { requirePermission } from '@/server/session';
import { saveItem } from '../../actions';

export const metadata = { title: 'Nuevo artículo · Omnia' };

export default async function NewItemPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requirePermission(org, 'inventory.write');
  const customFields = (await container().organizations.customFields(ctx)).filter((f) => f.entity === 'inventory_item');
  return (
    <>
      <PageHeader title="Nuevo artículo" back={{ href: `/o/${org}/almacen/articulos`, label: 'Artículos' }} />
      <Cell>
        <div className="max-w-3xl">
          <ItemForm action={saveItem.bind(null, org, null)} customFields={customFields} />
        </div>
      </Cell>
    </>
  );
}

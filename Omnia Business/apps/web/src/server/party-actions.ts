'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { container } from './container';
import { flag, formObject, runAction, type ActionState } from './actions';
import { requirePermission } from './session';

/** Alta/edición de cliente o proveedor. `back` es la ruta del listado que lo llamó. */
export async function saveParty(org: string, id: string | null, back: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let savedId = id;
  const result = await runAction(async () => {
    const { ctx } = await requirePermission(org, 'parties.write');
    savedId = await container().parties.save(
      ctx,
      { ...formObject(formData), isCustomer: flag(formData, 'isCustomer'), isSupplier: flag(formData, 'isSupplier') },
      id ?? undefined,
    );
    revalidatePath(`/o/${org}`, 'layout');
  });
  if (result.ok && !id) redirect(`${back}/${savedId}`);
  return { ...result, ...(result.ok ? { message: 'Datos guardados' } : {}) };
}

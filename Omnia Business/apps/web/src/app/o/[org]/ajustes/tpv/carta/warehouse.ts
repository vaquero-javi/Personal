import 'server-only';
import type { TenantContext } from '@omnia/core';
import { container } from '@/server/container';

/**
 * Almacén con el que se calculan costes y stock de la carta: el elegido, el
 * del primer terminal activo (de donde descuenta el TPV) o el primero que haya.
 */
export async function menuWarehouse(ctx: TenantContext, requested?: string) {
  const [terminals, warehouses] = await Promise.all([container().pos.terminals(ctx), container().warehouse.warehouses(ctx)]);
  const active = warehouses.filter((w) => w.isActive);
  const fromTerminals = [...new Map(terminals.filter((t) => !t.revokedAt).map((t) => [t.warehouseId, t.warehouseName])).entries()];
  const options = fromTerminals.length ? fromTerminals.map(([id, name]) => ({ id, name })) : active.map((w) => ({ id: w.id, name: w.name }));
  const selected = options.find((o) => o.id === requested) ?? options[0] ?? null;
  return { selected, options };
}

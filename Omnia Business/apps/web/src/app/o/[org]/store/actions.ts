'use server';

import { revalidatePath } from 'next/cache';
import { container } from '@/server/container';
import { runAction, type ActionState } from '@/server/actions';
import { DomainError } from '@omnia/core';
import { requireOrg } from '@/server/session';

/** Solo los propietarios de la sociedad compran o desinstalan (la base lo vuelve a exigir). */
async function requireOwner(org: string) {
  const scope = await requireOrg(org);
  if (scope.org.roleKey !== 'owner') throw new DomainError('FORBIDDEN', 'Solo los propietarios de la sociedad pueden comprar o quitar módulos');
  return scope;
}

/** Store: comprar (instalar) un módulo Pro. Se activa al momento para toda la sociedad. */
export async function installFeature(org: string, code: string, _: ActionState, _fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, catalog } = await requireOwner(org);
    await container().entitlements.storeSet(ctx, code, true);
    revalidatePath('/o', 'layout');
    return `${catalog.find((f) => f.code === code)?.name ?? 'Módulo'} instalado`;
  });
}

/** Store: desinstalar un módulo Pro. Se bloquea al momento; los datos se conservan. */
export async function uninstallFeature(org: string, code: string, _: ActionState, _fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, catalog } = await requireOwner(org);
    await container().entitlements.storeSet(ctx, code, false);
    revalidatePath('/o', 'layout');
    return `${catalog.find((f) => f.code === code)?.name ?? 'Módulo'} desinstalado`;
  });
}

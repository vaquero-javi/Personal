'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { withUser } from '@omnia/db';
import { container } from './container';
import { requireUserId } from './session';

const Subscription = z.object({
  endpoint: z.url().startsWith('https://').max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Activa las notificaciones en este navegador/dispositivo. */
export async function savePushSubscription(raw: unknown): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const sub = Subscription.parse(raw);
  const userAgent = (await headers()).get('user-agent')?.slice(0, 300) ?? null;
  await withUser(container().sql, userId, async (tx) => {
    // El mismo navegador pudo estar suscrito con otra cuenta: pasa a esta.
    await tx`select app.drop_push_subscription(${sub.endpoint})`;
    await tx`
      insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
      values (${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${userAgent})`;
  });
  return { ok: true };
}

/** Las desactiva en este navegador/dispositivo. */
export async function removePushSubscription(endpoint: unknown): Promise<{ ok: boolean }> {
  const userId = await requireUserId();
  const value = z.string().max(1000).parse(endpoint);
  await withUser(container().sql, userId, (tx) => tx`delete from push_subscriptions where endpoint = ${value}`);
  return { ok: true };
}

/** Prueba: se manda un aviso a sí misma a todos sus dispositivos. */
export async function sendTestPush(): Promise<{ ok: boolean; devices: number }> {
  const userId = await requireUserId();
  const { pushConfigured } = await import('./push');
  if (!pushConfigured()) return { ok: false, devices: 0 };
  const webpush = (await import('web-push')).default;
  const subs = await withUser(container().sql, userId, (tx) => tx<{ endpoint: string; p256dh: string; auth: string }[]>`
    select endpoint, p256dh, auth from push_subscriptions where user_id = ${userId}`);
  await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: 'Notificaciones activadas', body: 'Así te avisará Omnia de mensajes, tareas, incidencias, ausencias y nóminas.', url: '/app', tag: 'test' }),
      ),
    ),
  );
  return { ok: true, devices: subs.length };
}

const Category = z.enum(['messages', 'tasks', 'incidents', 'leave', 'payslips']);
export type PushCategory = z.infer<typeof Category>;

/** Tipos de aviso que la persona ha silenciado (vale para todos sus dispositivos). */
export async function getMutedPush(): Promise<PushCategory[]> {
  const userId = await requireUserId();
  const [row] = await withUser(container().sql, userId, (tx) => tx<{ muted: string[] }[]>`
    select muted from push_preferences where user_id = ${userId}`);
  return (row?.muted ?? []).filter((c): c is PushCategory => Category.safeParse(c).success);
}

/** Activa o silencia un tipo de aviso. */
export async function setPushCategory(category: unknown, enabled: unknown): Promise<PushCategory[]> {
  const userId = await requireUserId();
  const cat = Category.parse(category);
  const on = z.boolean().parse(enabled);
  const [row] = await withUser(container().sql, userId, (tx) => tx<{ muted: string[] }[]>`
    select app.set_push_category(${cat}, ${on}) as muted`);
  return (row?.muted ?? []) as PushCategory[];
}

import 'server-only';
import webpush, { WebPushError } from 'web-push';
import { withUser } from '@omnia/db';
import { logger } from '@omnia/core';
import { container } from './container';

// Notificaciones push (Web Push). Los avisos los encolan triggers de la base
// (migración 0049); aquí se envían. Claves VAPID en .env.local:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:omniahold@gmail.com', publicKey, privateKey);
  return (configured = true);
}

interface Claimed {
  id: string;
  user_id: string;
  title: string;
  body: string;
  url: string;
  tag: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Envía los avisos que acaba de provocar `userId` (los recoge la base y los
 * marca como enviados). No lanza: un fallo de push nunca rompe la acción.
 */
export async function flushPush(userId: string): Promise<void> {
  if (!pushConfigured()) return;
  try {
    const sql = container().sql;
    const rows = await withUser(sql, userId, async (tx) => (await tx`select * from app.claim_push_outbox()`) as unknown as Claimed[]);
    await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.tag }),
            { TTL: 60 * 60 * 24, urgency: 'normal' },
          );
        } catch (error) {
          // 404/410: el navegador retiró la suscripción (permiso quitado, app desinstalada…).
          if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
            await withUser(sql, userId, (tx) => tx`select app.drop_push_subscription(${row.endpoint})`);
          } else {
            logger.warn('push: envío fallido', { error, endpoint: row.endpoint.slice(0, 60) });
          }
        }
      }),
    );
  } catch (error) {
    logger.error('push: no se ha podido vaciar la cola', { error });
  }
}

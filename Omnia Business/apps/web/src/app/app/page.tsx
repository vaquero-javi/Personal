import { redirect } from 'next/navigation';
import { myMemberships } from '@/server/session';

/** Entrada a la app: abre la sociedad por defecto (o la creación de la primera). */
export default async function AppHome() {
  const memberships = await myMemberships();
  const target = memberships.find((m) => m.isDefault) ?? memberships[0];
  redirect(target ? `/o/${target.slug}` : '/o/nueva');
}

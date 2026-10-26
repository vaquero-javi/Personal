import { redirect } from 'next/navigation';
import { myMemberships } from '@/server/session';

export default async function Home() {
  const memberships = await myMemberships();
  const target = memberships.find((m) => m.isDefault) ?? memberships[0];
  redirect(target ? `/o/${target.slug}` : '/o/nueva');
}

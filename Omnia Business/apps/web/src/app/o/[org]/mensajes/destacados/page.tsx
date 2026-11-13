import { Mailbox } from '@/features/messages/mailbox';

export const metadata = { title: 'Destacados · Mensajes · Omnia' };

export default async function DestacadosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <Mailbox org={org} box="starred" />;
}

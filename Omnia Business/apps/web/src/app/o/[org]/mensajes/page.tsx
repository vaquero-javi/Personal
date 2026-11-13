import { Mailbox } from '@/features/messages/mailbox';

export const metadata = { title: 'Recibidos · Mensajes · Omnia' };

export default async function RecibidosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <Mailbox org={org} box="inbox" />;
}

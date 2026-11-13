import { Mailbox } from '@/features/messages/mailbox';

export const metadata = { title: 'Enviados · Mensajes · Omnia' };

export default async function EnviadosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <Mailbox org={org} box="sent" />;
}

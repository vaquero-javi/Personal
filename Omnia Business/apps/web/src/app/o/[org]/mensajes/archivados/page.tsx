import { Mailbox } from '@/features/messages/mailbox';

export const metadata = { title: 'Archivados · Mensajes · Omnia' };

export default async function ArchivadosPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <Mailbox org={org} box="archived" />;
}

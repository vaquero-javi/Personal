import { Cell, PageHeader } from '@/components/ui/layout';
import { ActionForm, TextAreaField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { RecipientPicker } from '@/features/messages/recipient-picker';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { sendMessage } from '../actions';

export const metadata = { title: 'Redactar · Mensajes · Omnia' };

export default async function ComposePage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ para?: string }> }) {
  const { org } = await params;
  const { para } = await searchParams;
  const { ctx } = await requireOrg(org);
  const people = await container().messages.recipients(ctx);
  return (
    <>
      <PageHeader title="Redactar" back={{ href: `/o/${org}/mensajes`, label: 'Recibidos' }} />
      <Cell className="max-w-3xl">
        <ActionForm action={sendMessage.bind(null, org)} className="flex flex-col gap-4">
          <RecipientPicker people={people} initial={para ? [para] : []} />
          <TextField label="Asunto" name="subject" required maxLength={200} />
          <TextAreaField label="Mensaje" name="body" required rows={10} maxLength={20000} />
          <div>
            <SubmitButton pendingLabel="Enviando…">Enviar</SubmitButton>
          </div>
        </ActionForm>
      </Cell>
    </>
  );
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { container } from '@/server/container';
import { formObject, runAction, type ActionState } from '@/server/actions';
import { FEATURES } from '@/server/features';
import { requireFeature } from '@/server/session';

// La barra lateral (no leídos) vive en el layout de /o: se revalida desde la raíz.
const refresh = () => revalidatePath('/', 'layout');

export async function sendMessage(org: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let id = '';
  const result = await runAction(async () => {
    const { ctx } = await requireFeature(org, FEATURES.messages);
    id = await container().messages.compose(ctx, formObject(formData));
    refresh();
  });
  if (result.ok) redirect(`/o/${org}/mensajes/c/${id}`);
  return result;
}

export async function replyMessage(org: string, threadId: string, _: ActionState, formData: FormData) {
  return runAction(async () => {
    const { ctx } = await requireFeature(org, FEATURES.messages);
    await container().messages.reply(ctx, { threadId, body: formData.get('body') });
    refresh();
    return 'Respuesta enviada';
  });
}

export async function setThreadState(org: string, threadId: string, patch: { read?: boolean; archived?: boolean; starred?: boolean }, _: ActionState, _fd: FormData) {
  return runAction(async () => {
    const { ctx } = await requireFeature(org, FEATURES.messages);
    await container().messages.setState(ctx, { threadId, ...patch });
    refresh();
    return patch.archived === true ? 'Conversación archivada' : patch.archived === false ? 'Movida a Recibidos' : patch.read === false ? 'Marcada como no leída' : undefined;
  });
}

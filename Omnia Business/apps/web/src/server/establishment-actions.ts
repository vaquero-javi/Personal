'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { establishmentCookie, orgEstablishments, requireOrg } from './session';

/** Elige la empresa con la que se filtra la app en esta sociedad ('' = todas). */
export async function setActiveEstablishment(slug: string, formData: FormData) {
  const { org } = await requireOrg(slug);
  const raw = formData.get('establishmentId');
  const store = await cookies();
  const name = establishmentCookie(org.organizationId);
  const id = raw ? z.uuid().parse(raw) : null;
  if (id && (await orgEstablishments(slug)).some((e) => e.id === id && e.isActive)) {
    store.set(name, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === 'production' });
  } else {
    store.delete(name);
  }
  // También la barra lateral (layout de /o), que marca la empresa elegida.
  revalidatePath('/', 'layout');
}

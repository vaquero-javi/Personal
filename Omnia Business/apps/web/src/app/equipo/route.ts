import { redirect } from 'next/navigation';

/**
 * Botón «Equipo Omnia» de la portada: lleva al panel del equipo, que es OTRA
 * aplicación (apps/admin) con su propio inicio de sesión. Aquí no se comprueba
 * nada: el acceso lo decide aquella app contra public.platform_admins.
 */
export function GET() {
  redirect(`${(process.env.ADMIN_APP_URL ?? 'http://localhost:3300').replace(/\/$/, '')}/entrar`);
}

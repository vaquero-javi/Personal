# CHRONOS

App personal: calendario mensual con eventos y recordatorios, avisos configurables (X minutos/horas/días antes) que llegan como notificación push al móvil y al ordenador, y apuntes organizados en secciones.

**Stack:** React + TypeScript + Vite (PWA) · Tailwind · FullCalendar · TipTap · Supabase (Auth, Postgres, Edge Functions, pg_cron) · Vercel.

## Cómo funcionan los avisos

1. Cada evento puede tener varios avisos (`event_alerts`). La base de datos calcula `fire_at = inicio − antelación` y lo recalcula si mueves el evento. En eventos de todo el día se cuenta desde las 9:00.
2. `pg_cron` llama cada minuto a la Edge Function `send-alerts`, que envía un Web Push a todos tus dispositivos con notificaciones activadas.
3. Además, la campana 🔔 de la app muestra los avisos que ya han llegado hasta que los descartes o pospongas, aunque el push no llegara.

## Puesta en marcha

Necesitas [Node.js](https://nodejs.org) 20 o superior.

### 1. Supabase

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta por orden `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_cron.sql` `supabase/migrations/0003_notes_drawing.sql`, `supabase/migrations/0004_note_folders.sql` y `supabase/migrations/0005_note_pdfs.sql` y `supabase/migrations/0006_study_items.sql`.
3. Genera las claves VAPID para push:
   ```bash
   npx web-push generate-vapid-keys
   ```
4. Inventa un secreto largo para el cron (p. ej. `openssl rand -hex 32`) y guárdalo en Vault junto con la URL del proyecto (SQL Editor):
   ```sql
   select vault.create_secret('https://TU-PROYECTO.supabase.co', 'project_url');
   select vault.create_secret('TU-CRON-SECRET', 'cron_secret');
   ```
5. Despliega la Edge Function y sus secretos:
   ```bash
   npx supabase login
   npx supabase link --project-ref TU-PROYECTO
   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@email.com CRON_SECRET=TU-CRON-SECRET
   npx supabase functions deploy send-alerts --no-verify-jwt
   ```
   Opcional: `APP_TIMEZONE` (por defecto `Europe/Madrid`) para el texto de las notificaciones.

### Iniciar sesión con Google (opcional)

1. En [Google Cloud Console](https://console.cloud.google.com) → **APIs y servicios → Pantalla de consentimiento de OAuth**, configúrala (tipo *Externo*, con tu email como usuario de prueba si no la publicas).
2. En **Credenciales → Crear credenciales → ID de cliente de OAuth** → *Aplicación web*:
   - **Orígenes de JavaScript autorizados:** `http://localhost:5173` y la URL de Vercel.
   - **URIs de redireccionamiento autorizados:** `https://TU-PROYECTO.supabase.co/auth/v1/callback`
3. En Supabase → **Authentication → Sign In / Providers → Google**, actívalo y pega el *Client ID* y el *Client Secret*.
4. En Supabase → **Authentication → URL Configuration → Redirect URLs**, añade `http://localhost:5173` y la URL de Vercel.

Si ya tienes cuenta con email y usas el mismo correo de Google, Supabase vincula las dos identidades a la misma cuenta.

### 2. App

```bash
cp .env.example .env.local   # rellena URL, anon key y la clave VAPID pública
npm install
npm run dev
```

Abre http://localhost:5173, crea tu cuenta y, en **Ajustes**, activa las notificaciones.

Cuando tengas tu cuenta creada, desactiva los registros nuevos en Supabase → **Authentication → Sign In / Providers → Allow new users to sign up**, para que nadie más pueda crear cuenta.

### 3. Publicarla (para usarla desde el móvil)

1. Sube el proyecto a GitHub e impórtalo en [vercel.com](https://vercel.com).
2. Añade las tres variables `VITE_*` de `.env.local` en Vercel → Settings → Environment Variables.
3. En Supabase → Authentication → URL Configuration, pon la URL de Vercel como **Site URL**.
4. En el móvil, abre la URL:
   - **iPhone:** Compartir → *Añadir a pantalla de inicio*, abre la app desde el icono y activa las notificaciones en Ajustes (iOS 16.4+).
   - **Android:** menú → *Instalar app* (o simplemente activa las notificaciones en Ajustes).

## Probar los avisos

Crea un evento para dentro de 3 minutos con el aviso "En el momento" o uno personalizado de 1 minuto antes. En ≤ 1 minuto desde la hora del aviso debería llegar la notificación y aparecer en la campana. Si no llega, mira **Edge Functions → send-alerts → Logs** en Supabase y, en SQL Editor, `select * from cron.job_run_details order by start_time desc limit 5;`.

## Apuntes: carpetas y hoja

Las notas se organizan en **carpetas**, que pueden contener subcarpetas (migración `0004_note_folders.sql`). Al crear una nota se elige cómo vas a escribirla (a mano con el lápiz o con el teclado) y qué hoja quieres (líneas, cuadros o blanca); la nota abre ya con la herramienta que toca. Con una nota abierta la hoja ocupa todo el ancho, y el botón **Carpetas** vuelve a mostrar las listas.

## Apuntes a mano

Cada nota es una hoja de libreta: se elige el papel (rayado, cuadrícula, puntos o liso) y se puede escribir con el teclado o a mano con el lápiz.

- **Lápiz**: trazo sensible a la presión del Apple Pencil.
- **Marcador**: subrayado translúcido.
- **Goma**: borra el trazo entero que toca, como el borrador de trazo de GoodNotes.
- **Dedo**: por defecto desplaza la hoja y solo pinta el lápiz. Se cambia con el botón *Dedo desplaza* de la barra.

Los trazos se guardan en la columna `drawing` de `notes` (migración `0003_notes_drawing.sql`), en coordenadas de página, así una nota escrita en el iPad se ve igual en el ordenador.

## PDFs

Dentro de una carpeta, **Nuevo → Subir PDF** importa un PDF como documento: cada página del PDF es una hoja sobre la que se puede escribir a mano, subrayar o añadir texto, y se pueden meter hojas en blanco entre medias o quitar páginas. El archivo se guarda en el bucket privado `documents` de Supabase Storage (migración `0005_note_pdfs.sql`, máximo 50 MB) y se borra al borrar el documento o su carpeta.

## Estudiar con IA

En cualquier documento, el botón **Estudiar con IA** abre un panel al estilo NotebookLM con cuatro pestañas: **Chat** (preguntas sobre los apuntes), **Resumen**, **Examen** (tipo test y abiertas, con corrección) y **Tarjetas** (se les da la vuelta y se barajan). La IA lee el texto escrito a teclado, las hojas escritas a mano (se le mandan como imágenes) y el PDF, si lo hay.

Lo hace la Edge Function `study-ai` con Gemini de Google, en el nivel gratuito: usa `gemini-3.8-flash` y, si está saturado o se ha gastado su cupo, pasa solo a `gemini-3.6-flash`, `gemini-3.5-flash` o `gemini-3.7-flash`. Los resúmenes, exámenes y tarjetas se guardan en la tabla `study_items` (migración `0006_study_items.sql`); el chat no se guarda. Para activarla:

```bash
npx supabase secrets set GEMINI_API_KEY=...   # clave de https://aistudio.google.com/apikey
npx supabase functions deploy study-ai
```

## Cambiar el logo

El logo vive en `public/logo.png` como silueta transparente, así que la app lo tiñe del color que toque en cada tema. Para sustituirlo por otra imagen (tinta oscura sobre fondo claro):

```bash
node scripts/logo-mask.mjs ~/Downloads/mi-logo.jpg   # recorta y genera public/logo.png
npm run icons                                        # regenera los iconos de la PWA
```

## Estructura

```
src/
  features/
    auth/        login y sesión
    calendar/    calendario, editor de eventos, selector de avisos
    alerts/      campana y lista de avisos (descartar / posponer)
    notes/       carpetas, lista de notas y editor (papel, texto y escritura a mano)
    dashboard/   pantalla de inicio (hoy, próximos 7 días, atrasados)
    settings/    notificaciones y cuenta
  lib/           cliente Supabase, fechas, push, tipos
  sw.ts          service worker (caché offline + notificaciones)
scripts/
  logo-mask.mjs  convierte una imagen en la silueta del logo
  generate-icons.mjs  iconos de la PWA a partir del logo
supabase/
  migrations/    tablas, triggers de avisos, seguridad (RLS) y cron
  functions/send-alerts/   envío de notificaciones push
```

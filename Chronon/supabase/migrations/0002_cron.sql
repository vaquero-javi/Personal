-- Llama cada minuto a la Edge Function "send-alerts", que envía las notificaciones push pendientes.
-- Antes de que funcione hay que guardar dos secretos en Vault (ver README):
--   select vault.create_secret('https://TU-PROYECTO.supabase.co', 'project_url');
--   select vault.create_secret('EL-MISMO-CRON_SECRET-DE-LA-FUNCION', 'cron_secret');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'send-alerts',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

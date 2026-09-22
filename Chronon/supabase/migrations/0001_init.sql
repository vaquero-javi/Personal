-- =========================================================
-- CHRONON: eventos, recordatorios, avisos y apuntes
-- =========================================================

-- ---------- Eventos y recordatorios ----------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null,
  description text,
  type        text not null default 'event' check (type in ('event', 'reminder')),
  start_at    timestamptz not null,
  -- Para eventos de todo el día, end_at es exclusivo (medianoche del día siguiente al último).
  end_at      timestamptz,
  all_day     boolean not null default false,
  color       text not null default '#4f46e5',
  completed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index events_user_start_idx on public.events (user_id, start_at);

-- ---------- Avisos (varios por evento) ----------
create table public.event_alerts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  event_id       uuid not null references public.events on delete cascade,
  offset_minutes integer not null check (offset_minutes >= 0),
  fire_at        timestamptz not null,
  sent_at        timestamptz,
  dismissed_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (event_id, offset_minutes)
);
create index event_alerts_pending_idx on public.event_alerts (fire_at) where sent_at is null and dismissed_at is null;
create index event_alerts_user_idx on public.event_alerts (user_id, fire_at);

-- Momento en que salta un aviso. En eventos de todo el día se cuenta desde las 9:00
-- (start_at es medianoche local), para que "1 día antes" no suene a las 00:00.
create or replace function public.compute_fire_at(p_start timestamptz, p_all_day boolean, p_offset integer)
returns timestamptz
language sql immutable
as $$
  select p_start
       + case when p_all_day then interval '9 hours' else interval '0' end
       - make_interval(mins => p_offset)
$$;

create or replace function public.event_alerts_set_fire_at()
returns trigger
language plpgsql
as $$
declare
  ev record;
begin
  select start_at, all_day into ev from public.events where id = new.event_id;
  if not found then
    raise exception 'Evento % no encontrado', new.event_id;
  end if;
  new.fire_at := public.compute_fire_at(ev.start_at, ev.all_day, new.offset_minutes);
  -- Un aviso cuyo momento ya pasó al crearlo no tiene sentido que salte.
  if new.fire_at < now() then
    new.dismissed_at := now();
  else
    new.dismissed_at := null;
    new.sent_at := null;
  end if;
  return new;
end;
$$;

-- Solo al crear o al cambiar la antelación; así "posponer" puede fijar fire_at a mano.
create trigger event_alerts_fire_at
  before insert or update of offset_minutes on public.event_alerts
  for each row execute function public.event_alerts_set_fire_at();

create or replace function public.events_after_update()
returns trigger
language plpgsql
as $$
begin
  if new.start_at is distinct from old.start_at or new.all_day is distinct from old.all_day then
    update public.event_alerts
       set fire_at = public.compute_fire_at(new.start_at, new.all_day, offset_minutes),
           sent_at = null,
           dismissed_at = case
             when public.compute_fire_at(new.start_at, new.all_day, offset_minutes) < now() then now()
           end
     where event_id = new.id;
  end if;
  -- Un recordatorio marcado como hecho ya no debe avisar.
  if new.completed and not old.completed then
    update public.event_alerts
       set dismissed_at = now()
     where event_id = new.id and dismissed_at is null;
  end if;
  return new;
end;
$$;

create trigger events_after_update
  after update on public.events
  for each row execute function public.events_after_update();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------- Apuntes ----------
create table public.note_sections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  color      text not null default '#4f46e5',
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index note_sections_user_idx on public.note_sections (user_id, position);

create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  section_id   uuid not null references public.note_sections on delete cascade,
  title        text not null default '',
  content      jsonb,
  -- Texto plano del contenido, para buscar.
  content_text text not null default '',
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index notes_section_idx on public.notes (section_id, pinned desc, updated_at desc);

create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- ---------- Suscripciones push (una por dispositivo) ----------
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  device_label text,
  created_at   timestamptz not null default now()
);

-- ---------- Seguridad: cada usuario solo ve lo suyo ----------
alter table public.events             enable row level security;
alter table public.event_alerts       enable row level security;
alter table public.note_sections      enable row level security;
alter table public.notes              enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "own events" on public.events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own alerts" on public.event_alerts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own sections" on public.note_sections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notes" on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

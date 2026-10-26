-- =====================================================================
-- Omnia · 0004 · Fichajes, vacaciones/permisos e incidencias
--
-- Registro de jornada (art. 34.9 ET): los fichajes se conservan 4 años y no se
-- alteran. Una corrección es un fichaje nuevo `source = 'manual'` que apunta al
-- original y explica el motivo.
-- =====================================================================

create table public.time_entries (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  user_id           uuid not null,
  entry_type        text not null check (entry_type in ('clock_in', 'clock_out', 'break_start', 'break_end')),
  occurred_at       timestamptz not null default now(),   -- momento del fichaje (puede venir de un dispositivo offline)
  recorded_at       timestamptz not null default now(),   -- momento en que llegó al servidor
  source            text not null default 'web' check (source in ('web', 'mobile', 'kiosk', 'manual')),
  -- Geolocalización opcional y solo con consentimiento (RGPD).
  latitude          numeric(9, 6) check (latitude between -90 and 90),
  longitude         numeric(9, 6) check (longitude between -180 and 180),
  accuracy_m        numeric(8, 2) check (accuracy_m >= 0),
  geo_consent       boolean not null default false,
  corrects_entry_id uuid,
  correction_reason text,
  device_info       jsonb not null default '{}' check (jsonb_typeof(device_info) = 'object'),
  custom_fields     jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object'),
  created_by        uuid not null references public.users (id) default app.current_user_id(),
  unique (organization_id, id),
  -- El empleado debe pertenecer a la organización (y la membresía no se puede
  -- borrar mientras tenga fichajes: se suspende).
  foreign key (organization_id, user_id) references public.user_organizations (organization_id, user_id),
  foreign key (organization_id, corrects_entry_id) references public.time_entries (organization_id, id),
  check ((latitude is null) = (longitude is null)),
  check (latitude is null or geo_consent),
  check (corrects_entry_id is null or correction_reason is not null),
  check (source <> 'manual' or correction_reason is not null)
);
create index time_entries_user_idx on public.time_entries (organization_id, user_id, occurred_at desc);

create trigger time_entries_immutable before update or delete on public.time_entries
  for each row execute function app.forbid_mutation();

alter table public.time_entries enable row level security;
create policy time_entries_select on public.time_entries for select to app_user
  using (
    (user_id = (select app.current_user_id()) and organization_id in (select app.active_org_ids()))
    or organization_id in (select app.authorized_org_ids('hr.time.read'))
  );
create policy time_entries_insert on public.time_entries for insert to app_user
  with check (
    created_by = (select app.current_user_id())
    and (
      -- RRHH: fichajes manuales y correcciones de cualquiera.
      organization_id in (select app.authorized_org_ids('hr.time.manage'))
      -- Empleado: solo los suyos, sin 'manual' y con hora plausible
      -- (hasta 72 h atrás para sincronizaciones offline del móvil).
      or (
        user_id = (select app.current_user_id())
        and organization_id in (select app.authorized_org_ids('hr.time.self'))
        and source <> 'manual'
        and corrects_entry_id is null
        and occurred_at between now() - interval '72 hours' and now() + interval '2 minutes'
      )
    )
  );
grant select, insert on public.time_entries to app_user;

-- ---------------------------------------------------------------------
-- Vacaciones y permisos
-- ---------------------------------------------------------------------

create table public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id         uuid not null,
  leave_type      text not null check (leave_type in ('vacation', 'sick', 'personal', 'parental', 'other')),
  starts_on       date not null,
  ends_on         date not null,
  half_day        boolean not null default false,
  status          text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'cancelled')),
  reason          text,
  reviewed_by     uuid references public.users (id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, user_id) references public.user_organizations (organization_id, user_id),
  check (ends_on >= starts_on),
  check (not half_day or starts_on = ends_on),
  check ((status in ('approved', 'rejected')) = (reviewed_by is not null and reviewed_at is not null))
);
create index leave_requests_user_idx on public.leave_requests (organization_id, user_id, starts_on);

create trigger leave_requests_touch before update on public.leave_requests
  for each row execute function app.touch_updated_at();

alter table public.leave_requests enable row level security;
create policy leave_requests_select on public.leave_requests for select to app_user
  using (
    (user_id = (select app.current_user_id()) and organization_id in (select app.active_org_ids()))
    or organization_id in (select app.authorized_org_ids('hr.leave.approve'))
  );
create policy leave_requests_insert on public.leave_requests for insert to app_user
  with check (
    user_id = (select app.current_user_id())
    and status = 'requested'
    and organization_id in (select app.authorized_org_ids('hr.leave.request'))
  );
create policy leave_requests_update on public.leave_requests for update to app_user
  using (
    organization_id in (select app.authorized_org_ids('hr.leave.approve'))
    or (user_id = (select app.current_user_id()) and status = 'requested')
  )
  with check (
    organization_id in (select app.authorized_org_ids('hr.leave.approve'))
    -- el solicitante solo puede cancelar su propia solicitud
    or (user_id = (select app.current_user_id()) and status in ('requested', 'cancelled') and reviewed_by is null)
  );
grant select, insert, update on public.leave_requests to app_user;

-- ---------------------------------------------------------------------
-- Incidencias / ticketing
-- ---------------------------------------------------------------------

create table public.incidents (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  number                   bigint,
  title                    text not null check (char_length(title) between 3 and 200),
  description              text,
  category                 text,
  status                   text not null default 'open'
                           check (status in ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  priority                 text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  -- Sujeto de la incidencia: un cliente/proveedor O un empleado (o ninguno).
  party_id                 uuid,
  employee_user_id         uuid,
  related_invoice_id       uuid,
  related_goods_receipt_id uuid,
  reported_by              uuid not null references public.users (id) default app.current_user_id(),
  assignee_user_id         uuid,
  due_at                   timestamptz,
  resolved_at              timestamptz,
  custom_fields            jsonb not null default '{}' check (jsonb_typeof(custom_fields) = 'object'),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, party_id) references public.parties (organization_id, id),
  foreign key (organization_id, employee_user_id) references public.user_organizations (organization_id, user_id),
  foreign key (organization_id, assignee_user_id) references public.user_organizations (organization_id, user_id),
  foreign key (organization_id, related_invoice_id) references public.invoices (organization_id, id),
  foreign key (organization_id, related_goods_receipt_id) references public.goods_receipts (organization_id, id),
  check (num_nonnulls(party_id, employee_user_id) <= 1),
  check ((status in ('resolved', 'closed')) = (resolved_at is not null))
);
create index incidents_queue_idx on public.incidents (organization_id, status, priority, created_at desc);
create index incidents_assignee_idx on public.incidents (organization_id, assignee_user_id) where status not in ('resolved', 'closed');

create or replace function app.sync_incident_resolution() returns trigger
language plpgsql as $$
begin
  if new.status in ('resolved', 'closed') and new.resolved_at is null then
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at := null;
  end if;
  return new;
end
$$;

create trigger incidents_number before insert on public.incidents
  for each row execute function app.assign_document_number('incident');
create trigger incidents_resolution before insert or update of status on public.incidents
  for each row execute function app.sync_incident_resolution();
create trigger incidents_touch before update on public.incidents
  for each row execute function app.touch_updated_at();
create trigger incidents_audit after insert or update or delete on public.incidents
  for each row execute function app.audit_row();

alter table public.incidents enable row level security;
create policy incidents_select on public.incidents for select to app_user
  using (
    organization_id in (select app.authorized_org_ids('incidents.read'))
    or (
      organization_id in (select app.active_org_ids())
      and (select app.current_user_id()) in (reported_by, assignee_user_id)
    )
  );
create policy incidents_insert on public.incidents for insert to app_user
  with check (
    organization_id in (select app.authorized_org_ids('incidents.write'))
    and reported_by = (select app.current_user_id())
  );
create policy incidents_update on public.incidents for update to app_user
  using (
    organization_id in (select app.authorized_org_ids('incidents.manage'))
    or (
      organization_id in (select app.authorized_org_ids('incidents.write'))
      and assignee_user_id = (select app.current_user_id())
    )
  )
  with check (
    organization_id in (select app.authorized_org_ids('incidents.manage'))
    or (
      organization_id in (select app.authorized_org_ids('incidents.write'))
      and assignee_user_id = (select app.current_user_id())   -- no puede reasignársela a otro
    )
  );
create policy incidents_delete on public.incidents for delete to app_user
  using (organization_id in (select app.authorized_org_ids('incidents.manage')));
grant select, insert, update, delete on public.incidents to app_user;

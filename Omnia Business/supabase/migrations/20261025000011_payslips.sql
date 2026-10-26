-- Nóminas. RRHH sube el documento de cada persona y mes; cada persona ve las
-- suyas al entrar con su cuenta (su correo). Es un dato especialmente sensible:
-- nadie más las ve salvo quien tenga hr.payroll.manage.

insert into public.permissions (code, module, description) values
  ('hr.payroll.manage', 'hr', 'Subir y consultar las nóminas de todo el personal');

create table public.payslips (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id         uuid not null,
  period          date not null check (extract(day from period) = 1),   -- primer día del mes
  kind            text not null default 'monthly' check (kind in ('monthly', 'bonus', 'settlement')),
  net_amount      numeric(12, 2) check (net_amount >= 0),               -- líquido a percibir
  content_type    text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_name       text not null check (length(file_name) between 1 and 200),
  byte_size       integer not null check (byte_size between 1 and 7340032),   -- 7 MB
  content         bytea not null check (length(content) = byte_size),
  viewed_at       timestamptz,                                          -- primera vez que la abrió la persona
  created_by      uuid references public.users (id) default app.current_user_id(),
  created_at      timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, user_id, period, kind),                      -- una por persona, mes y tipo
  foreign key (organization_id, user_id) references public.user_organizations (organization_id, user_id)
);
create index payslips_user_idx on public.payslips (organization_id, user_id, period desc);

-- Auditoría sin el archivo (no se duplican megas en audit_log).
create or replace function app.audit_row_without_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old) - 'content'; else v_row := to_jsonb(new) - 'content'; end if;
  insert into public.audit_log (organization_id, table_name, row_id, action, actor_id, old_data, new_data)
  values (
    (v_row ->> 'organization_id')::uuid,
    tg_table_name,
    (v_row ->> 'id')::uuid,
    tg_op,
    app.current_user_id(),
    case when tg_op <> 'INSERT' then to_jsonb(old) - 'content' end,
    case when tg_op <> 'DELETE' then to_jsonb(new) - 'content' end
  );
  return null;
end
$$;

create trigger payslips_audit after insert or update or delete on public.payslips
  for each row execute function app.audit_row_without_content();

alter table public.payslips enable row level security;
create policy payslips_select on public.payslips for select to app_user
  using (
    (user_id = (select app.current_user_id()) and organization_id in (select app.active_org_ids()))
    or organization_id in (select app.authorized_org_ids('hr.payroll.manage'))
  );
create policy payslips_insert on public.payslips for insert to app_user
  with check (organization_id in (select app.authorized_org_ids('hr.payroll.manage')) and viewed_at is null);
-- Se borra (p. ej. subida a la persona equivocada) y se vuelve a subir; nunca se edita.
create policy payslips_delete on public.payslips for delete to app_user
  using (organization_id in (select app.authorized_org_ids('hr.payroll.manage')));
grant select, insert, delete on public.payslips to app_user;

-- Acuse de lectura: solo la propia persona, y solo la primera vez.
create or replace function app.mark_payslip_viewed(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.payslips
  set viewed_at = now()
  where id = p_id
    and viewed_at is null
    and user_id = app.current_user_id()
    and organization_id in (select app.active_org_ids())
$$;
revoke all on function app.mark_payslip_viewed(uuid) from public;
grant execute on function app.mark_payslip_viewed(uuid) to app_user;

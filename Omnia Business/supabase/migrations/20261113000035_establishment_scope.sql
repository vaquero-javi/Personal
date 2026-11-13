-- =====================================================================
-- Omnia · 0035 · Empresas (locales), fase 2: personal, turnos, fichajes y cifras
--
--   establishment_members  quién trabaja en cada empresa (una persona puede estar en varias)
--   shifts.establishment_id      en qué local es el turno
--   time_entries.establishment_id en qué local se fichó (lo rellena la base si se puede deducir)
--   app.stats_establishments()   ventas, tickets, stock y horas por local
--
-- El tenant sigue siendo la sociedad: todo lleva FKs compuestas (organization_id, …)
-- para que una empresa de otra sociedad no se pueda referenciar nunca.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Personal por empresa
-- ---------------------------------------------------------------------

create table public.establishment_members (
  organization_id  uuid not null,
  establishment_id uuid not null,
  user_id          uuid not null,
  created_at       timestamptz not null default now(),
  primary key (establishment_id, user_id),
  foreign key (organization_id, establishment_id) references public.establishments (organization_id, id) on delete cascade,
  -- Solo personas de la sociedad; si sale de ella (se borra la membresía), sale de sus locales.
  foreign key (organization_id, user_id) references public.user_organizations (organization_id, user_id) on delete cascade
);
create index establishment_members_user_idx on public.establishment_members (organization_id, user_id);

alter table public.establishment_members enable row level security;
create policy establishment_members_select on public.establishment_members for select to app_user
  using (organization_id in (select app.active_org_ids()));
create policy establishment_members_insert on public.establishment_members for insert to app_user
  with check (organization_id in (select app.authorized_org_ids('members.manage')));
create policy establishment_members_delete on public.establishment_members for delete to app_user
  using (organization_id in (select app.authorized_org_ids('members.manage')));
grant select, insert, delete on public.establishment_members to app_user;

-- ---------------------------------------------------------------------
-- Turnos
-- ---------------------------------------------------------------------

alter table public.shifts add column establishment_id uuid;
alter table public.shifts
  add constraint shifts_establishment_fk foreign key (organization_id, establishment_id)
  references public.establishments (organization_id, id) on delete set null (establishment_id);
create index shifts_establishment_idx on public.shifts (organization_id, establishment_id, starts_at) where establishment_id is not null;

-- ---------------------------------------------------------------------
-- Fichajes (inmutables: la empresa se fija al insertar y no cambia)
-- ---------------------------------------------------------------------

alter table public.time_entries add column establishment_id uuid;
-- RESTRICT: un fichaje es un registro legal; la empresa no se puede borrar si tiene fichajes (se desactiva).
alter table public.time_entries
  add constraint time_entries_establishment_fk foreign key (organization_id, establishment_id)
  references public.establishments (organization_id, id) on delete restrict;
create index time_entries_establishment_idx on public.time_entries (organization_id, establishment_id, occurred_at) where establishment_id is not null;

-- Si no viene la empresa, se deduce: la del terminal del TPV donde se fichó y, si
-- no, la única en la que trabaja la persona. Si viene, la persona debe trabajar
-- en ella (cuando tiene locales asignados).
create or replace function app.fill_time_entry_establishment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_est uuid;
begin
  if new.establishment_id is null and new.device_info ? 'terminalId' then
    select w.establishment_id into v_est
    from public.pos_terminals t
    join public.warehouses w on w.organization_id = t.organization_id and w.id = t.warehouse_id
    where t.organization_id = new.organization_id and t.id::text = new.device_info ->> 'terminalId';
    new.establishment_id := v_est;
  end if;

  if new.establishment_id is null then
    select min(em.establishment_id::text)::uuid into v_est
    from public.establishment_members em
    where em.organization_id = new.organization_id and em.user_id = new.user_id
    having count(*) = 1;
    new.establishment_id := v_est;
  elsif new.source <> 'manual'
        and exists (select 1 from public.establishment_members em where em.organization_id = new.organization_id and em.user_id = new.user_id)
        and not exists (select 1 from public.establishment_members em
                        where em.organization_id = new.organization_id and em.user_id = new.user_id
                          and em.establishment_id = new.establishment_id) then
    raise exception 'No trabajas en ese local' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger time_entries_fill_establishment before insert on public.time_entries
  for each row execute function app.fill_time_entry_establishment();

-- ---------------------------------------------------------------------
-- Cifras por empresa
-- ---------------------------------------------------------------------

-- Una fila por empresa (y una sin empresa si hay ventas o stock sin asignar):
-- facturación del periodo atribuida por el almacén del que salió la venta
-- (ticket del TPV → terminal → almacén; pedido B2B → almacén), stock a coste,
-- personas asignadas y horas de turno programadas.
create or replace function app.stats_establishments(p_org uuid, p_from date, p_to date)
returns table (
  establishment_id uuid,
  name             text,
  is_active        boolean,
  sales_base       numeric,
  pos_base         numeric,
  tickets          integer,
  b2b_base         numeric,
  stock_value      numeric,
  staff            integer,
  shift_hours      numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_permission(p_org, 'stats.read') then
    raise exception 'Ver estadísticas requiere el permiso correspondiente' using errcode = '42501';
  end if;
  return query
  with sold as (
    select i.id, i.subtotal,
           (i.invoice_type = 'F2' and i.party_id is null) as is_pos,
           coalesce(
             (select w.establishment_id from public.pos_tabs t
                join public.pos_terminals pt on pt.organization_id = t.organization_id and pt.id = t.terminal_id
                join public.warehouses w on w.organization_id = pt.organization_id and w.id = pt.warehouse_id
              where t.organization_id = i.organization_id and t.invoice_id = i.id limit 1),
             (select w.establishment_id from public.sales_orders so
                join public.warehouses w on w.organization_id = so.organization_id and w.id = so.warehouse_id
              where so.organization_id = i.organization_id and so.invoice_id = i.id limit 1)
           ) as est
    from public.invoices i
    where i.organization_id = p_org and i.direction = 'issued'
      and i.status in ('issued', 'partially_paid', 'paid')
      and i.issue_date between p_from and p_to
  ),
  sales as (
    select est, sum(subtotal) as base, sum(subtotal) filter (where is_pos) as pos,
           count(*) filter (where is_pos)::int as n_pos, sum(subtotal) filter (where not is_pos) as b2b
    from sold group by est
  ),
  stock as (
    select w.establishment_id as est, sum(sl.on_hand * sl.avg_unit_cost) as value
    from public.stock_levels sl
    join public.warehouses w on w.id = sl.warehouse_id
    where sl.organization_id = p_org group by w.establishment_id
  ),
  people as (
    select em.establishment_id as est, count(*)::int as n from public.establishment_members em
    where em.organization_id = p_org group by em.establishment_id
  ),
  hours as (
    select s.establishment_id as est, sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600) as h
    from public.shifts s
    where s.organization_id = p_org and s.starts_at >= p_from and s.starts_at < p_to + 1
    group by s.establishment_id
  ),
  keys as (
    select e.id as est, e.name, e.is_active from public.establishments e where e.organization_id = p_org
    union all
    select null, null, true
    where exists (select 1 from sales where est is null) or exists (select 1 from stock where est is null and value <> 0)
  )
  select k.est, k.name, k.is_active,
         coalesce(sa.base, 0)::numeric(18,2), coalesce(sa.pos, 0)::numeric(18,2), coalesce(sa.n_pos, 0),
         coalesce(sa.b2b, 0)::numeric(18,2), coalesce(st.value, 0)::numeric(18,2),
         coalesce(pe.n, 0), coalesce(ho.h, 0)::numeric(10,1)
  from keys k
  left join sales sa on sa.est is not distinct from k.est
  left join stock st on st.est is not distinct from k.est
  left join people pe on pe.est is not distinct from k.est
  left join hours ho on ho.est is not distinct from k.est
  order by k.est is null, k.is_active desc, k.name;
end
$$;
revoke all on function app.stats_establishments(uuid, date, date) from public;
grant execute on function app.stats_establishments(uuid, date, date) to app_user;

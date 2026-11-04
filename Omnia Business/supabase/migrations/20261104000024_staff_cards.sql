-- =====================================================================
-- Omnia · 0024 · Tarjetas digitales de empleado (Apple Wallet / Google Wallet)
--
-- Un empleado lleva en el móvil una tarjeta con un QR. El TPV lo lee y, si
-- todo cuadra, aplica a la cuenta el descuento de empleado de su rol.
--
-- Antifraude (ver docs/arquitectura.md §10):
--   * El QR lleva un secreto por tarjeta. En Google Wallet rota cada 30 s
--     (TOTP) y no admite capturas en Android; en Apple Wallet es estático,
--     así que por defecto se pide además el PIN del titular en el TPV.
--   * Todo se decide aquí, no en la tablet: estado de la tarjeta, membresía
--     activa, límites por día y por mes, y que nadie se aplique su propia
--     tarjeta mientras atiende (cuatro ojos).
--   * Revocar es inmediato: la siguiente lectura falla. Avisar al móvil
--     (push de Apple, PATCH a Google) es posterior, vía cola (outbox).
-- SQL portable (PostgreSQL 15+).
-- =====================================================================

insert into public.permissions (code, module, description) values
  ('staff_cards.*',      'staff_cards', 'Todo sobre tarjetas de empleado'),
  ('staff_cards.manage', 'staff_cards', 'Emitir y revocar tarjetas de empleado y configurar sus descuentos');

create or replace function app.seed_staff_card_permissions(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.role_permissions (organization_id, role_id, permission_code)
  select r.organization_id, r.id, 'staff_cards.*'
  from public.roles r
  where r.organization_id = p_org and r.key = 'admin'
  on conflict do nothing;
$$;
revoke all on function app.seed_staff_card_permissions(uuid) from public;
select app.seed_staff_card_permissions(id) from public.organizations;

create or replace function app.seed_staff_card_permissions_on_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.seed_staff_card_permissions(new.organization_id);
  return new;
end
$$;
create trigger roles_seed_staff_cards after insert on public.roles
  for each row when (new.key = 'admin') execute function app.seed_staff_card_permissions_on_role();

-- ---------------------------------------------------------------------
-- Política de descuento: por rol, con una general de la empresa (role_id null)
-- ---------------------------------------------------------------------

create table public.staff_discount_policies (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  role_id              uuid,                          -- null = política general
  discount_pct         numeric(5, 2) not null check (discount_pct > 0 and discount_pct <= 100),
  max_uses_per_day     integer check (max_uses_per_day > 0),            -- null = sin límite
  monthly_discount_cap numeric(18, 2) check (monthly_discount_cap > 0), -- € descontados al mes; null = sin límite
  require_pin          boolean not null default true,  -- segundo factor en el TPV
  allow_self_service   boolean not null default false, -- ¿puede aplicársela quien maneja el TPV?
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique nulls not distinct (organization_id, role_id),
  foreign key (organization_id, role_id) references public.roles (organization_id, id) on delete cascade
);
create trigger staff_discount_policies_touch before update on public.staff_discount_policies
  for each row execute function app.touch_updated_at();
create trigger staff_discount_policies_audit after insert or update or delete on public.staff_discount_policies
  for each row execute function app.audit_row();

alter table public.staff_discount_policies enable row level security;
create policy staff_discount_policies_select on public.staff_discount_policies for select to app_user
  using (organization_id in (select app.authorized_org_ids('staff_cards.manage')));
create policy staff_discount_policies_write on public.staff_discount_policies for all to app_user
  using (organization_id in (select app.authorized_org_ids('staff_cards.manage')))
  with check (organization_id in (select app.authorized_org_ids('staff_cards.manage')));
grant select, insert, update, delete on public.staff_discount_policies to app_user;

-- ---------------------------------------------------------------------
-- Tarjetas
-- ---------------------------------------------------------------------

create table public.employee_cards (
  id               uuid primary key default gen_random_uuid(),   -- también es el serialNumber del pase
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  user_id          uuid not null,
  wallet           text not null check (wallet in ('apple', 'google')),
  status           text not null default 'active' check (status in ('active', 'revoked')),
  -- Secreto del QR, cifrado por la aplicación (AES-256-GCM, STAFF_CARD_SECRET_KEY):
  -- Apple, el token estático; Google, la semilla TOTP. app_user no puede leerlo.
  secret_enc       bytea not null,
  last_totp_step   bigint,              -- Google: último paso TOTP aceptado (un código, un uso)
  apple_auth_hash  text,                -- Apple: sha256 del authenticationToken del web service
  version          integer not null default 1,   -- sube con cada cambio visible en el pase
  issued_by        uuid references public.users (id) default app.current_user_id(),
  issued_at        timestamptz not null default now(),
  revoked_at       timestamptz,
  revoked_by       uuid references public.users (id),
  revoke_reason    text check (revoke_reason is null or char_length(revoke_reason) <= 200),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, user_id) references public.user_organizations (organization_id, user_id),
  check ((wallet = 'apple') = (apple_auth_hash is not null)),
  check ((status = 'revoked') = (revoked_at is not null))
);
-- Una tarjeta viva por persona y wallet: emitir otra revoca la anterior.
create unique index employee_cards_one_active on public.employee_cards (organization_id, user_id, wallet)
  where status = 'active';
create index employee_cards_user_idx on public.employee_cards (organization_id, user_id);
create unique index employee_cards_apple_auth_key on public.employee_cards (apple_auth_hash) where apple_auth_hash is not null;

create or replace function app.guard_employee_card() returns trigger
language plpgsql as $$
begin
  if old.status = 'revoked' and new.status = 'active' then
    raise exception 'Una tarjeta revocada no se reactiva: emite una nueva' using errcode = 'OM001';
  end if;
  if (new.id, new.organization_id, new.user_id, new.wallet, new.secret_enc, new.apple_auth_hash)
     is distinct from (old.id, old.organization_id, old.user_id, old.wallet, old.secret_enc, old.apple_auth_hash) then
    raise exception 'Los datos de una tarjeta no se modifican: revócala y emite otra' using errcode = 'OM001';
  end if;
  if new.status = 'revoked' and old.status = 'active' then
    new.revoked_at := coalesce(new.revoked_at, now());
    new.revoked_by := coalesce(new.revoked_by, app.current_user_id());
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end
$$;
create trigger employee_cards_guard before update on public.employee_cards
  for each row execute function app.guard_employee_card();
create trigger employee_cards_audit after insert or update on public.employee_cards
  for each row execute function app.audit_row();

alter table public.employee_cards enable row level security;
-- El responsable ve todas; cada persona, las suyas (para descargarlas).
create policy employee_cards_select on public.employee_cards for select to app_user
  using (
    organization_id in (select app.authorized_org_ids('staff_cards.manage'))
    or (user_id = (select app.current_user_id()) and organization_id in (select app.active_org_ids()))
  );
create policy employee_cards_insert on public.employee_cards for insert to app_user
  with check (organization_id in (select app.authorized_org_ids('staff_cards.manage')));
create policy employee_cards_update on public.employee_cards for update to app_user
  using (organization_id in (select app.authorized_org_ids('staff_cards.manage')))
  with check (organization_id in (select app.authorized_org_ids('staff_cards.manage')));
-- Sin SELECT sobre secret_enc ni apple_auth_hash.
grant select (id, organization_id, user_id, wallet, status, version, issued_by, issued_at, revoked_at, revoked_by, revoke_reason, updated_at)
  on public.employee_cards to app_user;
grant insert (id, organization_id, user_id, wallet, secret_enc, apple_auth_hash) on public.employee_cards to app_user;
grant update (status, revoke_reason) on public.employee_cards to app_user;

-- ---------------------------------------------------------------------
-- Usos del descuento (uno por cuenta a la que se aplica la tarjeta)
-- ---------------------------------------------------------------------

create table public.discount_redemptions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  card_id          uuid not null,
  user_id          uuid not null,                 -- titular (los límites son por persona, no por tarjeta)
  tab_id           uuid not null,                 -- cuenta a la que se aplicó
  terminal_id      uuid,
  applied_by       uuid not null references public.users (id) default app.current_user_id(),
  applied_at       timestamptz not null default now(),
  discount_pct     numeric(5, 2) not null,
  status           text not null default 'pending' check (status in ('pending', 'redeemed', 'void')),
  gross_amount     numeric(18, 2) not null default 0,   -- importe sin descuento de lo cobrado
  discount_amount  numeric(18, 2) not null default 0,   -- € descontados (con impuestos)
  last_invoice_id  uuid,
  closed_at        timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, card_id) references public.employee_cards (organization_id, id),
  foreign key (organization_id, user_id) references public.user_organizations (organization_id, user_id),
  foreign key (organization_id, tab_id) references public.pos_tabs (organization_id, id),
  foreign key (organization_id, terminal_id) references public.pos_terminals (organization_id, id),
  foreign key (organization_id, last_invoice_id) references public.invoices (organization_id, id)
);
-- Límites diarios y mensuales: siempre por (empresa, persona, fecha).
create index discount_redemptions_user_idx on public.discount_redemptions (organization_id, user_id, applied_at desc);
create index discount_redemptions_card_idx on public.discount_redemptions (organization_id, card_id);
create index discount_redemptions_tab_idx on public.discount_redemptions (organization_id, tab_id);

alter table public.discount_redemptions enable row level security;
create policy discount_redemptions_select on public.discount_redemptions for select to app_user
  using (
    organization_id in (select app.authorized_org_ids('staff_cards.manage'))
    or (user_id = (select app.current_user_id()) and organization_id in (select app.active_org_ids()))
  );
-- El TPV ve los usos en curso (para mostrar de quién es la tarjeta de una cuenta abierta),
-- pero no el historial: ese es del responsable o del propio titular.
create policy discount_redemptions_select_pos on public.discount_redemptions for select to app_user
  using (status = 'pending' and organization_id in (select app.authorized_org_ids('pos.use')));
-- Altas y cambios solo por funciones (app.pos_apply_staff_card y el trigger de cobro).
grant select on public.discount_redemptions to app_user;

-- La cuenta recuerda qué uso de descuento lleva aplicado.
alter table public.pos_tabs
  add column staff_redemption_id uuid,
  add column staff_discount_pct  numeric(5, 2) check (staff_discount_pct > 0 and staff_discount_pct <= 100),
  add constraint pos_tabs_staff_redemption_fk foreign key (organization_id, staff_redemption_id)
    references public.discount_redemptions (organization_id, id),
  add constraint pos_tabs_staff_discount_both check ((staff_redemption_id is null) = (staff_discount_pct is null));
create index pos_tabs_staff_redemption_idx on public.pos_tabs (organization_id, staff_redemption_id)
  where staff_redemption_id is not null;

-- ---------------------------------------------------------------------
-- Cola de actualizaciones de pases (outbox): la transacción que cambia una
-- tarjeta deja aquí el aviso; un proceso aparte hace el push a Apple/Google.
-- ---------------------------------------------------------------------

create table public.wallet_pass_updates (
  id            bigint generated always as identity primary key,
  card_id       uuid not null references public.employee_cards (id) on delete cascade,
  version       integer not null,
  created_at    timestamptz not null default now(),
  attempts      integer not null default 0,
  last_error    text,
  processed_at  timestamptz
);
create index wallet_pass_updates_pending_idx on public.wallet_pass_updates (created_at) where processed_at is null;
alter table public.wallet_pass_updates enable row level security;   -- sin políticas: solo funciones

create or replace function app.enqueue_wallet_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.version = old.version then
    return null;
  end if;
  insert into public.wallet_pass_updates (card_id, version) values (new.id, new.version);
  return null;
end
$$;
-- Sin «of version»: los triggers por columna solo miran el SET de la sentencia, y al
-- revocar la versión la sube la guarda (BEFORE), no quien hace el UPDATE.
create trigger employee_cards_enqueue after update on public.employee_cards
  for each row execute function app.enqueue_wallet_update();

-- Cambiar la política o el rol de alguien cambia lo que muestra su pase.
create or replace function app.bump_cards_on_policy() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
begin
  update public.employee_cards set version = version + 1
  where organization_id = v_org and status = 'active';
  return null;
end
$$;
create trigger staff_discount_policies_bump after insert or update or delete on public.staff_discount_policies
  for each row execute function app.bump_cards_on_policy();

-- Baja o suspensión: las tarjetas se revocan en la misma transacción.
-- Cambio de rol: el pase se actualiza (puede cambiar el porcentaje).
create or replace function app.sync_cards_on_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' and old.status = 'active' then
    update public.employee_cards
    set status = 'revoked', revoked_at = now(), revoke_reason = 'Baja o suspensión en la empresa'
    where organization_id = new.organization_id and user_id = new.user_id and status = 'active';
  elsif new.role_id is distinct from old.role_id then
    update public.employee_cards set version = version + 1
    where organization_id = new.organization_id and user_id = new.user_id and status = 'active';
  end if;
  return null;
end
$$;
create trigger user_organizations_sync_cards after update of status, role_id on public.user_organizations
  for each row execute function app.sync_cards_on_membership();

-- ---------------------------------------------------------------------
-- Datos de una tarjeta para la aplicación (incluido el secreto cifrado)
-- ---------------------------------------------------------------------

-- Política que aplica a una persona: la de su rol o, si no hay, la general.
create or replace function app.staff_policy_for(p_org uuid, p_user uuid)
returns public.staff_discount_policies
language sql stable security definer set search_path = '' as $$
  select p.*
  from public.user_organizations uo
  join public.staff_discount_policies p
    on p.organization_id = uo.organization_id and (p.role_id = uo.role_id or p.role_id is null)
  where uo.organization_id = p_org and uo.user_id = p_user and p.is_active
  order by p.role_id is null   -- primero la del rol
  limit 1
$$;

-- Lo que la aplicación necesita para pintar el pase o validar un QR, según el propósito:
--   p_for_pos = false (descargar/ver el pase): solo el titular o un responsable de tarjetas.
--   p_for_pos = true  (validar un QR en el TPV): cualquiera con pos.use en la empresa.
-- Separarlo importa: si no, un camarero podría descargar el pase de un compañero.
create or replace function app.staff_card(p_card uuid, p_for_pos boolean default false)
returns table (
  card_id uuid, organization_id uuid, user_id uuid, wallet text, status text, version integer,
  secret_enc bytea, last_totp_step bigint, updated_at timestamptz,
  holder_name text, role_name text, org_name text, discount_pct numeric, member_active boolean
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.organization_id, c.user_id, c.wallet, c.status, c.version,
         c.secret_enc, c.last_totp_step, c.updated_at,
         coalesce(u.full_name, u.email), r.name, coalesce(o.trade_name, o.legal_name),
         (app.staff_policy_for(c.organization_id, c.user_id)).discount_pct,
         uo.status = 'active'
  from public.employee_cards c
  join public.organizations o on o.id = c.organization_id
  join public.users u on u.id = c.user_id
  join public.user_organizations uo on uo.organization_id = c.organization_id and uo.user_id = c.user_id
  join public.roles r on r.id = uo.role_id
  where c.id = p_card
    and case
      when p_for_pos then c.organization_id in (select app.authorized_org_ids('pos.use'))
      else c.organization_id in (select app.authorized_org_ids('staff_cards.manage'))
           or (c.user_id = app.current_user_id() and c.organization_id in (select app.active_org_ids()))
    end
$$;

-- ---------------------------------------------------------------------
-- Aplicar y quitar la tarjeta en una cuenta del TPV
-- ---------------------------------------------------------------------

-- Lo llama el TPV después de verificar el QR (y el PIN, si la política lo pide).
-- p_totp_step: paso TOTP aceptado (Google) para impedir que el mismo código
-- valga dos veces; null en Apple.
create or replace function app.pos_apply_staff_card(
  p_tab uuid, p_card uuid, p_totp_step bigint, p_pin_verified boolean, p_terminal uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tab        public.pos_tabs;
  v_card       public.employee_cards;
  v_policy     public.staff_discount_policies;
  v_active     boolean;
  v_uses       integer;
  v_month      numeric;
  v_redemption uuid;
begin
  select * into v_tab from public.pos_tabs where id = p_tab for update;
  if not found or not (v_tab.organization_id in (select app.authorized_org_ids('pos.use'))) then
    raise exception 'Cuenta no encontrada' using errcode = 'P0002';
  end if;
  if v_tab.status not in ('open', 'billing') then
    raise exception 'La cuenta ya está cerrada' using errcode = 'OM001';
  end if;

  -- Bloqueo de la tarjeta: dos TPV que la lean a la vez se serializan aquí.
  select * into v_card from public.employee_cards
  where id = p_card and organization_id = v_tab.organization_id for update;
  if not found then
    raise exception 'Esta tarjeta no es de esta empresa' using errcode = 'OM002', detail = 'CARD_UNKNOWN';
  end if;
  if v_card.status <> 'active' then
    raise exception 'Tarjeta revocada' using errcode = 'OM002', detail = 'CARD_REVOKED';
  end if;
  select uo.status = 'active' into v_active from public.user_organizations uo
  where uo.organization_id = v_card.organization_id and uo.user_id = v_card.user_id;
  if not coalesce(v_active, false) then
    raise exception 'El titular ya no está activo en la empresa' using errcode = 'OM002', detail = 'HOLDER_INACTIVE';
  end if;

  if v_tab.staff_redemption_id is not null then
    if exists (select 1 from public.discount_redemptions d where d.id = v_tab.staff_redemption_id and d.card_id = p_card) then
      return jsonb_build_object('redemptionId', v_tab.staff_redemption_id, 'discountPct', v_tab.staff_discount_pct, 'alreadyApplied', true);
    end if;
    raise exception 'La cuenta ya tiene aplicado otro descuento de empleado' using errcode = 'OM002', detail = 'TAB_HAS_CARD';
  end if;

  v_policy := app.staff_policy_for(v_card.organization_id, v_card.user_id);
  if v_policy.id is null then
    raise exception 'El rol del titular no tiene descuento de empleado' using errcode = 'OM002', detail = 'NO_POLICY';
  end if;
  if v_policy.require_pin and not coalesce(p_pin_verified, false) then
    raise exception 'Falta el PIN del titular' using errcode = 'OM002', detail = 'PIN_REQUIRED';
  end if;
  if not v_policy.allow_self_service and v_card.user_id = app.current_user_id() then
    raise exception 'No puedes aplicarte tu propia tarjeta: pídeselo a un compañero' using errcode = 'OM002', detail = 'SELF_SERVICE';
  end if;

  if p_totp_step is not null then
    if v_card.last_totp_step is not null and p_totp_step <= v_card.last_totp_step then
      raise exception 'Este código ya se ha usado: espera a que cambie el QR' using errcode = 'OM002', detail = 'CODE_REUSED';
    end if;
    update public.employee_cards set last_totp_step = p_totp_step where id = p_card;
  end if;

  select count(*) filter (where d.applied_at >= current_date and d.status <> 'void'),
         coalesce(sum(d.discount_amount) filter (where d.applied_at >= date_trunc('month', current_date) and d.status = 'redeemed'), 0)
  into v_uses, v_month
  from public.discount_redemptions d
  where d.organization_id = v_card.organization_id and d.user_id = v_card.user_id
    and d.applied_at >= least(current_date, date_trunc('month', current_date)::date);
  if v_policy.max_uses_per_day is not null and v_uses >= v_policy.max_uses_per_day then
    raise exception 'Límite diario de descuentos alcanzado (%)', v_policy.max_uses_per_day using errcode = 'OM002', detail = 'DAILY_LIMIT';
  end if;
  if v_policy.monthly_discount_cap is not null and v_month >= v_policy.monthly_discount_cap then
    raise exception 'Límite mensual de descuento alcanzado (% €)', v_policy.monthly_discount_cap using errcode = 'OM002', detail = 'MONTHLY_LIMIT';
  end if;

  insert into public.discount_redemptions (organization_id, card_id, user_id, tab_id, terminal_id, discount_pct)
  values (v_card.organization_id, p_card, v_card.user_id, p_tab, p_terminal, v_policy.discount_pct)
  returning id into v_redemption;

  update public.pos_tabs
  set staff_redemption_id = v_redemption, staff_discount_pct = v_policy.discount_pct,
      status = 'open', precheck_at = null           -- el pre-ticket impreso deja de valer
  where id = p_tab;

  perform set_config('app.pos_staff_discount', 'on', true);
  update public.pos_tab_lines set discount_pct = greatest(discount_pct, v_policy.discount_pct)
  where organization_id = v_tab.organization_id and tab_id = p_tab;
  perform set_config('app.pos_staff_discount', 'off', true);

  return jsonb_build_object(
    'redemptionId', v_redemption,
    'discountPct', v_policy.discount_pct,
    'alreadyApplied', false,
    'usesToday', v_uses + 1,
    'maxUsesPerDay', v_policy.max_uses_per_day,
    'discountThisMonth', v_month,
    'monthlyCap', v_policy.monthly_discount_cap
  );
end
$$;

create or replace function app.pos_remove_staff_card(p_tab uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tab public.pos_tabs;
begin
  select * into v_tab from public.pos_tabs where id = p_tab for update;
  if not found or not (v_tab.organization_id in (select app.authorized_org_ids('pos.use'))) then
    raise exception 'Cuenta no encontrada' using errcode = 'P0002';
  end if;
  if v_tab.status not in ('open', 'billing') then
    raise exception 'La cuenta ya está cerrada' using errcode = 'OM001';
  end if;
  if v_tab.staff_redemption_id is null then
    return;
  end if;
  update public.discount_redemptions set status = 'void', closed_at = now()
  where id = v_tab.staff_redemption_id and status = 'pending';
  -- Las líneas de esta cuenta vuelven sin descuento (otro descuento manual lo reaplica el encargado).
  perform set_config('app.pos_staff_discount', 'on', true);
  update public.pos_tab_lines set discount_pct = 0 where organization_id = v_tab.organization_id and tab_id = p_tab;
  perform set_config('app.pos_staff_discount', 'off', true);
  update public.pos_tabs set staff_redemption_id = null, staff_discount_pct = null, status = 'open', precheck_at = null
  where id = p_tab;
end
$$;

revoke all on function app.staff_policy_for(uuid, uuid) from public;
revoke all on function app.staff_card(uuid, boolean) from public;
revoke all on function app.pos_apply_staff_card(uuid, uuid, bigint, boolean, uuid) from public;
revoke all on function app.pos_remove_staff_card(uuid) from public;
grant execute on function app.staff_card(uuid, boolean), app.pos_apply_staff_card(uuid, uuid, bigint, boolean, uuid),
  app.pos_remove_staff_card(uuid) to app_user;

-- Lo que se añade a la cuenta después de aplicar la tarjeta, también con descuento.
-- (Se ejecuta después de pos_tab_lines_guard por orden alfabético: la guarda ve
-- la línea sin descuento y no exige a un encargado.)
create or replace function app.apply_tab_staff_discount() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pct numeric;
begin
  select staff_discount_pct into v_pct from public.pos_tabs
  where organization_id = new.organization_id and id = new.tab_id;
  if v_pct is not null and new.discount_pct < v_pct then
    new.discount_pct := v_pct;
  end if;
  return new;
end
$$;
create trigger pos_tab_lines_staff_discount before insert on public.pos_tab_lines
  for each row execute function app.apply_tab_staff_discount();

-- La guarda de líneas deja pasar los cambios hechos por las funciones de
-- dividir cuenta y de descuento de empleado (DEFINER, nunca app_user).
create or replace function app.guard_pos_tab_line() returns trigger
language plpgsql as $$
declare
  v_org    uuid;
  v_tab    uuid;
  v_status text;
  v_manage boolean;
begin
  if current_user <> 'app_user'
     and (current_setting('app.pos_splitting', true) = 'on' or current_setting('app.pos_staff_discount', true) = 'on') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    v_org := old.organization_id; v_tab := old.tab_id;
  else
    v_org := new.organization_id; v_tab := new.tab_id;
  end if;
  select status into v_status from public.pos_tabs where organization_id = v_org and id = v_tab;
  if v_status is distinct from 'open' then
    raise exception 'La cuenta no admite cambios en estado %', coalesce(v_status, 'desconocido') using errcode = 'OM001';
  end if;
  v_manage := app.has_permission(v_org, 'pos.manage');

  if tg_op = 'INSERT' then
    if new.discount_pct <> 0 and not v_manage then
      raise exception 'Los descuentos los aplica un encargado' using errcode = 'OM002';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (new.item_id, new.unit_price, new.tax_rate, new.tab_id, new.added_by)
       is distinct from (old.item_id, old.unit_price, old.tax_rate, old.tab_id, old.added_by) then
      raise exception 'El artículo y el precio de una línea no se modifican: quítala y añádela de nuevo' using errcode = 'OM001';
    end if;
    if new.discount_pct <> old.discount_pct and not v_manage then
      raise exception 'Los descuentos los aplica un encargado' using errcode = 'OM002';
    end if;
    if old.sent_at is not null and new.quantity < old.quantity and not v_manage then
      raise exception 'Quitar algo ya enviado a cocina requiere a un encargado' using errcode = 'OM002';
    end if;
    return new;
  end if;

  if old.sent_at is not null and not v_manage then
    raise exception 'Quitar algo ya enviado a cocina requiere a un encargado' using errcode = 'OM002';
  end if;
  return old;
end
$$;

-- ---------------------------------------------------------------------
-- Al cobrar o anular: el uso queda cerrado con su importe real
-- ---------------------------------------------------------------------

create or replace function app.settle_staff_redemption() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_gross    numeric;
  v_total    numeric;
  v_pending  boolean;
begin
  if new.staff_redemption_id is null or new.status = old.status or new.status not in ('paid', 'cancelled') then
    return null;
  end if;

  if new.status = 'paid' then
    -- Importe sin descuento con la misma aritmética de invoice_lines (redondeo por línea).
    select sum(round(l.quantity * l.unit_price, 2) + round(round(l.quantity * l.unit_price, 2) * l.tax_rate / 100, 2)), i.total
    into v_gross, v_total
    from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
    where l.invoice_id = new.invoice_id
    group by i.total;
    update public.discount_redemptions
    set gross_amount = gross_amount + coalesce(v_gross, 0),
        discount_amount = discount_amount + greatest(coalesce(v_gross, 0) - coalesce(v_total, 0), 0),
        last_invoice_id = new.invoice_id
    where id = new.staff_redemption_id;
  end if;

  -- ¿Queda alguna cuenta abierta con este uso (p. ej. el resto de una cuenta dividida)?
  select exists (select 1 from public.pos_tabs t
                 where t.staff_redemption_id = new.staff_redemption_id and t.id <> new.id
                   and t.status in ('open', 'billing'))
  into v_pending;
  if not v_pending then
    update public.discount_redemptions
    set status = case when last_invoice_id is not null then 'redeemed' else 'void' end, closed_at = now()
    where id = new.staff_redemption_id;
  end if;
  return null;
end
$$;
create trigger pos_tabs_settle_staff after update of status on public.pos_tabs
  for each row execute function app.settle_staff_redemption();

-- Dividir una cuenta con tarjeta: la parte que se cobra aparte conserva el descuento
-- y cuenta en el mismo uso. Igual que en 0019, más los dos campos de la tarjeta.
create or replace function app.pos_split_tab(p_tab uuid, p_new_tab uuid, p_items jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tab   public.pos_tabs;
  v_label text;
  v_item  record;
  v_line  public.pos_tab_lines;
  v_moved integer := 0;
begin
  if exists (select 1 from public.pos_tabs where id = p_new_tab) then
    return p_new_tab;
  end if;

  select * into v_tab from public.pos_tabs where id = p_tab for update;
  if not found or v_tab.organization_id not in (select app.authorized_org_ids('pos.use')) then
    raise exception 'Cuenta no encontrada' using errcode = 'OM002';
  end if;
  if v_tab.status not in ('open', 'billing') then
    raise exception 'La cuenta ya está cerrada' using errcode = 'OM001';
  end if;

  select left(coalesce(t.name, v_tab.label, 'Cuenta ' || v_tab.number), 40) into v_label
  from (select 1) x left join public.pos_tables t on t.id = v_tab.table_id;

  insert into public.pos_tabs (id, organization_id, label, terminal_id, waiter_id, guests,
                               staff_redemption_id, staff_discount_pct)
  values (p_new_tab, v_tab.organization_id, v_label, v_tab.terminal_id, v_tab.waiter_id, 1,
          v_tab.staff_redemption_id, v_tab.staff_discount_pct);

  perform set_config('app.pos_splitting', 'on', true);
  for v_item in
    select (e ->> 'lineId')::uuid as line_id, (e ->> 'quantity')::numeric as quantity
    from jsonb_array_elements(p_items) e
  loop
    select * into v_line from public.pos_tab_lines
    where id = v_item.line_id and tab_id = p_tab for update;
    if not found then
      raise exception 'Una de las líneas ya no está en la cuenta' using errcode = 'OM002';
    end if;
    if v_item.quantity is null or v_item.quantity <= 0 or v_item.quantity > v_line.quantity then
      raise exception 'Cantidad no válida para «%»', v_line.description using errcode = 'OM002';
    end if;

    if v_item.quantity = v_line.quantity then
      update public.pos_tab_lines set tab_id = p_new_tab where id = v_line.id;
    else
      update public.pos_tab_lines set quantity = quantity - v_item.quantity where id = v_line.id;
      insert into public.pos_tab_lines (id, organization_id, tab_id, item_id, description, quantity, unit_price,
                                        tax_rate, discount_pct, note, sent_at, added_by, created_at)
      values (gen_random_uuid(), v_line.organization_id, p_new_tab, v_line.item_id, v_line.description, v_item.quantity,
              v_line.unit_price, v_line.tax_rate, v_line.discount_pct, v_line.note, v_line.sent_at, v_line.added_by, v_line.created_at);
    end if;
    v_moved := v_moved + 1;
  end loop;
  perform set_config('app.pos_splitting', 'off', true);

  if v_moved = 0 then
    raise exception 'Elige al menos un producto para cobrar aparte' using errcode = 'OM002';
  end if;
  return p_new_tab;
end
$$;

-- ---------------------------------------------------------------------
-- Web service de Apple Wallet (sin sesión de usuario: se autentica con el
-- authenticationToken del pase, del que aquí solo se guarda el hash)
-- ---------------------------------------------------------------------

create table public.apple_pass_registrations (
  device_library_id text not null check (char_length(device_library_id) between 1 and 200),
  card_id           uuid not null references public.employee_cards (id) on delete cascade,
  push_token        text not null check (char_length(push_token) between 1 and 200),
  created_at        timestamptz not null default now(),
  primary key (device_library_id, card_id)
);
create index apple_pass_registrations_card_idx on public.apple_pass_registrations (card_id);
alter table public.apple_pass_registrations enable row level security;   -- sin políticas: solo funciones

-- Tarjeta de un token de Apple (aunque esté revocada: el móvil tiene que poder
-- descargar la versión anulada del pase).
create or replace function app.apple_pass_card(p_card uuid, p_auth_hash text)
returns table (card_id uuid, organization_id uuid, user_id uuid, status text, version integer, updated_at timestamptz,
               secret_enc bytea, holder_name text, role_name text, org_name text, discount_pct numeric)
language sql stable security definer set search_path = '' as $$
  select c.id, c.organization_id, c.user_id, c.status, c.version, c.updated_at, c.secret_enc,
         coalesce(u.full_name, u.email), r.name, coalesce(o.trade_name, o.legal_name),
         (app.staff_policy_for(c.organization_id, c.user_id)).discount_pct
  from public.employee_cards c
  join public.organizations o on o.id = c.organization_id
  join public.users u on u.id = c.user_id
  join public.user_organizations uo on uo.organization_id = c.organization_id and uo.user_id = c.user_id
  join public.roles r on r.id = uo.role_id
  where c.id = p_card and c.wallet = 'apple' and c.apple_auth_hash = p_auth_hash
$$;

create or replace function app.apple_pass_register(p_card uuid, p_auth_hash text, p_device text, p_push_token text)
returns boolean   -- true si es un registro nuevo
language plpgsql security definer set search_path = '' as $$
declare
  v_new boolean;
begin
  if not exists (select 1 from public.employee_cards where id = p_card and wallet = 'apple' and apple_auth_hash = p_auth_hash) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.apple_pass_registrations as r (device_library_id, card_id, push_token)
  values (p_device, p_card, p_push_token)
  on conflict (device_library_id, card_id) do update set push_token = excluded.push_token
  returning (xmax = 0) into v_new;
  return v_new;
end
$$;

create or replace function app.apple_pass_unregister(p_card uuid, p_auth_hash text, p_device text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.employee_cards where id = p_card and wallet = 'apple' and apple_auth_hash = p_auth_hash) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  delete from public.apple_pass_registrations where device_library_id = p_device and card_id = p_card;
end
$$;

-- Pases de un dispositivo cambiados desde `p_since` (marca opaca = epoch en ms).
create or replace function app.apple_pass_updated_serials(p_device text, p_since timestamptz)
returns table (card_id uuid, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.updated_at
  from public.apple_pass_registrations r
  join public.employee_cards c on c.id = r.card_id
  where r.device_library_id = p_device and (p_since is null or c.updated_at > p_since)
$$;

-- Toma un lote de la cola de actualizaciones (FOR UPDATE SKIP LOCKED: varios
-- procesos pueden vaciarla a la vez sin pisarse).
create or replace function app.wallet_updates_claim(p_limit integer)
returns table (update_id bigint, card_id uuid, wallet text, organization_id uuid, push_tokens text[])
language sql security definer set search_path = '' as $$
  with batch as (
    select w.id from public.wallet_pass_updates w
    where w.processed_at is null and w.attempts < 8
    order by w.created_at
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update public.wallet_pass_updates w set attempts = w.attempts + 1
    from batch where w.id = batch.id
    returning w.id, w.card_id
  )
  select cl.id, c.id, c.wallet, c.organization_id,
         coalesce((select array_agg(r.push_token) from public.apple_pass_registrations r where r.card_id = c.id), '{}')
  from claimed cl join public.employee_cards c on c.id = cl.card_id
$$;

-- Datos de la tarjeta para el proceso que vacía la cola (sin sesión de usuario).
create or replace function app.wallet_card_for_update(p_card uuid)
returns table (
  card_id uuid, organization_id uuid, user_id uuid, wallet text, status text, version integer,
  secret_enc bytea, updated_at timestamptz,
  holder_name text, role_name text, org_name text, discount_pct numeric, member_active boolean
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.organization_id, c.user_id, c.wallet, c.status, c.version, c.secret_enc, c.updated_at,
         coalesce(u.full_name, u.email), r.name, coalesce(o.trade_name, o.legal_name),
         (app.staff_policy_for(c.organization_id, c.user_id)).discount_pct, uo.status = 'active'
  from public.employee_cards c
  join public.organizations o on o.id = c.organization_id
  join public.users u on u.id = c.user_id
  join public.user_organizations uo on uo.organization_id = c.organization_id and uo.user_id = c.user_id
  join public.roles r on r.id = uo.role_id
  -- Solo tarjetas con un aviso pendiente en la cola: no sirve para leer cualquiera.
  where c.id = p_card
    and exists (select 1 from public.wallet_pass_updates w where w.card_id = c.id and w.processed_at is null)
$$;
revoke all on function app.wallet_card_for_update(uuid) from public;
grant execute on function app.wallet_card_for_update(uuid) to app_user;

create or replace function app.wallet_update_done(p_update bigint, p_error text) returns void
language sql security definer set search_path = '' as $$
  update public.wallet_pass_updates
  set processed_at = case when p_error is null then now() end, last_error = p_error
  where id = p_update
$$;

-- Apple avisa de que un token de push ya no vale: se olvida.
create or replace function app.apple_pass_forget_token(p_push_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.apple_pass_registrations where push_token = p_push_token
$$;

revoke all on function app.apple_pass_card(uuid, text) from public;
revoke all on function app.apple_pass_register(uuid, text, text, text) from public;
revoke all on function app.apple_pass_unregister(uuid, text, text) from public;
revoke all on function app.apple_pass_updated_serials(text, timestamptz) from public;
revoke all on function app.wallet_updates_claim(integer) from public;
revoke all on function app.wallet_update_done(bigint, text) from public;
revoke all on function app.apple_pass_forget_token(text) from public;
grant execute on function
  app.apple_pass_card(uuid, text), app.apple_pass_register(uuid, text, text, text),
  app.apple_pass_unregister(uuid, text, text), app.apple_pass_updated_serials(text, timestamptz),
  app.wallet_updates_claim(integer), app.wallet_update_done(bigint, text), app.apple_pass_forget_token(text)
  to app_user;

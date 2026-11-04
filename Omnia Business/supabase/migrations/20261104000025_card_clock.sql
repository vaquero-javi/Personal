-- =====================================================================
-- Omnia · 0025 · Fichar con la tarjeta de empleado en la tablet del TPV
--
-- La misma tarjeta del descuento identifica al empleado para fichar en el
-- terminal (registro de jornada, origen «kiosk»). Sin sesión de usuario: la
-- tablet se autentica con su token, la tarjeta con su secreto (lo comprueba la
-- aplicación) y la persona con su PIN, siempre. Con un QR fijo, una foto bastaría
-- para fichar por un compañero; el PIN lo impide.
--
-- Estado del fichaje: el último fichaje de las últimas 16 horas. Así un turno
-- de noche (entra a las 22:00, sale a las 04:00) se cierra bien aunque cruce la
-- medianoche.
-- =====================================================================

-- Tarjeta leída en un terminal: datos para validar el QR y para mostrar el estado.
-- Solo si la tarjeta es de la empresa del terminal y el terminal está vinculado.
create or replace function app.pos_card_lookup(p_token_hash text, p_card uuid)
returns table (
  card_id uuid, organization_id uuid, user_id uuid, wallet text, status text, secret_enc bytea, last_totp_step bigint,
  holder_name text, role_name text, member_active boolean, can_clock boolean, has_pin boolean,
  clock_state text, last_entry_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.organization_id, c.user_id, c.wallet, c.status, c.secret_enc, c.last_totp_step,
         coalesce(u.full_name, u.email), r.name, uo.status = 'active',
         exists (select 1 from public.role_permissions rp
                 where rp.role_id = uo.role_id and rp.permission_code in ('*', 'hr.*', 'hr.time.self')),
         exists (select 1 from public.pos_staff_pins p where p.organization_id = c.organization_id and p.user_id = c.user_id),
         case last.entry_type
           when 'clock_in' then 'working' when 'break_end' then 'working'
           when 'break_start' then 'on_break'
           else 'out'
         end,
         last.occurred_at
  from public.pos_terminals t
  join public.employee_cards c on c.organization_id = t.organization_id and c.id = p_card
  join public.users u on u.id = c.user_id
  join public.user_organizations uo on uo.organization_id = c.organization_id and uo.user_id = c.user_id
  join public.roles r on r.id = uo.role_id
  left join lateral (
    select e.entry_type, e.occurred_at from public.time_entries e
    where e.organization_id = c.organization_id and e.user_id = c.user_id
      and e.occurred_at > now() - interval '16 hours'
    order by e.occurred_at desc, e.recorded_at desc
    limit 1
  ) last on true
  where t.token_hash = p_token_hash and t.revoked_at is null and t.deleted_at is null
$$;

-- Registra el fichaje. La aplicación ya ha comprobado el QR y el PIN; aquí se
-- vuelve a comprobar todo lo que depende de la base (estado, permisos, secuencia).
create or replace function app.pos_card_clock(
  p_token_hash text, p_card uuid, p_entry_type text, p_pin_verified boolean, p_totp_step bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_terminal public.pos_terminals;
  v_card     public.employee_cards;
  v_state    text;
  v_allowed  text[];
  v_at       timestamptz;
  v_name     text;
begin
  select * into v_terminal from public.pos_terminals
  where token_hash = p_token_hash and revoked_at is null and deleted_at is null;
  if not found then
    raise exception 'Terminal no vinculado' using errcode = '42501';
  end if;
  if not coalesce(p_pin_verified, false) then
    raise exception 'Falta el PIN del titular' using errcode = 'OM002', detail = 'PIN_REQUIRED';
  end if;
  if p_entry_type not in ('clock_in', 'clock_out', 'break_start', 'break_end') then
    raise exception 'Tipo de fichaje no válido' using errcode = 'OM002';
  end if;

  select * into v_card from public.employee_cards
  where id = p_card and organization_id = v_terminal.organization_id for update;
  if not found then
    raise exception 'Esta tarjeta no es de esta empresa' using errcode = 'OM002', detail = 'CARD_UNKNOWN';
  end if;
  if v_card.status <> 'active' then
    raise exception 'Tarjeta revocada' using errcode = 'OM002', detail = 'CARD_REVOKED';
  end if;
  if not exists (select 1 from public.user_organizations uo
                 where uo.organization_id = v_card.organization_id and uo.user_id = v_card.user_id and uo.status = 'active') then
    raise exception 'El titular ya no está activo en la empresa' using errcode = 'OM002', detail = 'HOLDER_INACTIVE';
  end if;
  if not exists (select 1 from public.user_organizations uo
                 join public.role_permissions rp on rp.role_id = uo.role_id
                 where uo.organization_id = v_card.organization_id and uo.user_id = v_card.user_id
                   and rp.permission_code in ('*', 'hr.*', 'hr.time.self')) then
    raise exception 'Tu puesto no tiene el registro de jornada activado' using errcode = 'OM002', detail = 'CANNOT_CLOCK';
  end if;
  -- QR dinámico: cada código, una vez (también entre fichar y descontar).
  if p_totp_step is not null then
    if v_card.last_totp_step is not null and p_totp_step <= v_card.last_totp_step then
      raise exception 'Este código ya se ha usado: espera a que cambie el QR' using errcode = 'OM002', detail = 'CODE_REUSED';
    end if;
    update public.employee_cards set last_totp_step = p_totp_step where id = p_card;
  end if;

  -- Una persona, un fichaje a la vez (dos lecturas seguidas no crean dos entradas).
  perform pg_advisory_xact_lock(hashtext(v_card.user_id::text || v_card.organization_id::text));
  select case e.entry_type
           when 'clock_in' then 'working' when 'break_end' then 'working'
           when 'break_start' then 'on_break'
           else 'out'
         end
  into v_state
  from public.time_entries e
  where e.organization_id = v_card.organization_id and e.user_id = v_card.user_id
    and e.occurred_at > now() - interval '16 hours'
  order by e.occurred_at desc, e.recorded_at desc
  limit 1;
  v_state := coalesce(v_state, 'out');
  v_allowed := case v_state
    when 'out' then array['clock_in']
    when 'working' then array['clock_out', 'break_start']
    else array['break_end', 'clock_out']
  end;
  if not (p_entry_type = any (v_allowed)) then
    raise exception '%', case p_entry_type
        when 'clock_in' then 'Ya habías fichado la entrada'
        when 'break_start' then 'Para empezar una pausa tienes que estar trabajando'
        when 'break_end' then 'No tienes ninguna pausa abierta'
        else 'No habías fichado la entrada'
      end
      using errcode = 'OM002', detail = 'WRONG_SEQUENCE';
  end if;

  insert into public.time_entries (organization_id, user_id, entry_type, source, device_info, created_by)
  values (v_card.organization_id, v_card.user_id, p_entry_type, 'kiosk',
          jsonb_build_object('terminalId', v_terminal.id, 'terminalName', v_terminal.name, 'cardId', v_card.id, 'method', 'card+pin'),
          v_card.user_id)
  returning occurred_at into v_at;

  select coalesce(u.full_name, u.email) into v_name from public.users u where u.id = v_card.user_id;
  return jsonb_build_object('entryType', p_entry_type, 'occurredAt', v_at, 'holderName', v_name);
end
$$;

revoke all on function app.pos_card_lookup(text, uuid) from public;
revoke all on function app.pos_card_clock(text, uuid, text, boolean, bigint) from public;
grant execute on function app.pos_card_lookup(text, uuid), app.pos_card_clock(text, uuid, text, boolean, bigint) to app_user;

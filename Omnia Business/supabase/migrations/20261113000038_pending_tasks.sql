-- =====================================================================
-- Omnia · 0038 · Tareas pendientes de todas mis sociedades (barra lateral)
--
-- Igual que app.my_unread_messages(): la barra lateral enseña, junto a
-- «Tareas», cuántas te han mandado y aún no has marcado como hechas. Se lee
-- sin sociedad activa, así que va por una función propia: solo tus tareas, en
-- sociedades donde eres miembro activo y con el módulo contratado. Las que te
-- mandas a ti mismo no cuentan.
-- =====================================================================

create or replace function app.my_pending_tasks()
returns table (organization_id uuid, pending integer)
language sql stable security definer set search_path = '' as $$
  select t.organization_id, count(*)::int
  from public.tasks t
  join public.user_organizations uo on uo.organization_id = t.organization_id and uo.user_id = t.assignee_user_id and uo.status = 'active'
  where t.assignee_user_id = app.current_user_id()
    and t.assigned_by <> t.assignee_user_id
    and t.status <> 'done'
    and 'tasks' in (select app.org_entitled_features(t.organization_id))
  group by t.organization_id
$$;
revoke all on function app.my_pending_tasks() from public;
grant execute on function app.my_pending_tasks() to app_user;

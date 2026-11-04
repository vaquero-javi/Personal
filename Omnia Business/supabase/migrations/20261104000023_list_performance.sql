-- Rendimiento de listados: paginación por cursor (keyset) e índices de claves ajenas.
--
-- 1. El listado de facturas cortaba en 300 filas: en un bar con TPV eso es menos
--    de un día de tickets, y las facturas más antiguas dejaban de verse.
--    Ahora se pagina por cursor sobre el orden (borrador, fecha, alta, id).
--
-- 2. Por qué una columna generada y no `coalesce(issue_date, 'infinity')` en el índice:
--    con RLS activo, Postgres solo lleva al índice las condiciones que considera
--    *leakproof*. Un `coalesce` dentro de la comparación del cursor no lo es, así
--    que el cursor se evaluaba fila a fila como filtro (8 ms en la página 300 de
--    30.000 facturas, creciendo con la profundidad). Con columnas simples entra en
--    el `Index Cond` y cuesta lo mismo en cualquier página (0,14 ms).
--
-- Nota de producción: añadir una columna STORED reescribe la tabla y crear índices
-- sin CONCURRENTLY bloquea escrituras. Con los volúmenes actuales es inmediato; con
-- millones de filas, aplicar por partes fuera de la transacción de la migración.

alter table public.invoices
  add column sort_date date generated always as (coalesce(issue_date, 'infinity'::date)) stored;

comment on column public.invoices.sort_date is
  'Clave de orden del listado: la fecha de emisión, o infinito en los borradores sin fecha (salen primero).';

-- En un trigger BEFORE UPDATE las columnas generadas aún no están calculadas
-- (NEW.sort_date llega NULL), así que el guardián de inmutabilidad veía un cambio
-- en cualquier factura emitida. Se excluye: deriva de issue_date, que sigue protegida.
create or replace function app.guard_invoice() returns trigger
language plpgsql as $$
declare
  -- Lo único que puede cambiar en una factura ya emitida (+ columnas generadas).
  v_mutable constant text[] := array['status', 'paid_total', 'fiscal_status', 'fiscal_response', 'updated_at', 'sort_date'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Una factura emitida no se borra: emite una rectificativa' using errcode = 'OM001';
    end if;
    return old;
  end if;

  if old.status <> 'draft' then
    if new.status = 'draft' then
      raise exception 'Una factura emitida no vuelve a borrador' using errcode = 'OM001';
    end if;
    if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
      raise exception 'La factura % está emitida y sus datos son inmutables', old.full_number using errcode = 'OM001';
    end if;
  end if;
  return new;
end
$$;

-- Orden del listado + prefijo de tenant. Sustituye a invoices_list_idx para listar;
-- ese se conserva para los rangos de fechas de estadísticas.
create index invoices_keyset_idx on public.invoices
  (organization_id, direction, (status = 'draft') desc, sort_date desc, created_at desc, id desc);

-- «Pendiente de cobro/pago» se suma en la base sobre todo el filtro, no sobre la página.
-- Las facturas vivas son pocas frente al histórico: índice parcial con los importes.
create index invoices_outstanding_idx on public.invoices (organization_id, direction, due_date)
  include (total, paid_total)
  where status in ('issued', 'partially_paid');

-- Filtro por tercero en emitidas (invoices_received_key solo cubre las recibidas).
create index invoices_party_idx on public.invoices (organization_id, party_id, sort_date desc);

-- Claves ajenas que se recorren en joins o en comprobaciones ON DELETE RESTRICT
-- (borrar un artículo, almacén o tercero obligaba a recorrer la tabla hija entera).
-- Las FKs a users (created_by, posted_by…) quedan sin índice a propósito: los
-- usuarios no se borran, se desactivan las membresías.
create index invoice_lines_item_idx         on public.invoice_lines        (organization_id, item_id) where item_id is not null;
create index pos_tab_lines_item_idx         on public.pos_tab_lines        (organization_id, item_id);
create index goods_receipt_lines_item_idx   on public.goods_receipt_lines  (organization_id, item_id);
create index purchase_order_lines_item_idx  on public.purchase_order_lines (organization_id, item_id);
create index sales_order_lines_item_idx     on public.sales_order_lines    (organization_id, item_id);
create index stock_levels_item_idx          on public.stock_levels         (organization_id, item_id);
create index purchase_orders_supplier_idx   on public.purchase_orders      (organization_id, supplier_id, order_date desc);
create index sales_orders_customer_idx      on public.sales_orders         (organization_id, customer_id, order_date desc);
create index incidents_party_idx            on public.incidents            (organization_id, party_id) where party_id is not null;
create index goods_receipts_warehouse_idx   on public.goods_receipts       (organization_id, warehouse_id);
create index pos_tabs_invoice_idx           on public.pos_tabs             (organization_id, invoice_id) where invoice_id is not null;

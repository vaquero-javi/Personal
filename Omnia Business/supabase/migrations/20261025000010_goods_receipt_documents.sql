-- Foto o PDF del albarán en papel, guardado junto al registro como
-- justificante. Uno por albarán y de solo alta: no se sustituye ni se edita
-- (se borra solo con el albarán en borrador, en cascada).

create table public.goods_receipt_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  receipt_id      uuid not null,
  content_type    text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf')),
  file_name       text not null check (length(file_name) between 1 and 200),
  byte_size       integer not null check (byte_size between 1 and 7340032),   -- 7 MB
  content         bytea not null check (length(content) = byte_size),
  created_by      uuid references public.users (id) default app.current_user_id(),
  created_at      timestamptz not null default now(),
  unique (organization_id, receipt_id),
  foreign key (organization_id, receipt_id) references public.goods_receipts (organization_id, id) on delete cascade
);

select app.apply_tenant_policies('public.goods_receipt_documents', 'inventory', p_append_only => true);

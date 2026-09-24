-- Estudio con IA: resúmenes, exámenes de prueba y tarjetas generados a partir de un documento.
-- content: { markdown } para resúmenes, { questions: [...] } para exámenes, { cards: [...] } para tarjetas.
create table if not exists public.study_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  note_id    uuid not null references public.notes on delete cascade,
  kind       text not null check (kind in ('summary', 'exam', 'cards')),
  title      text not null default '',
  content    jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists study_items_note_idx on public.study_items (note_id, kind, created_at desc);

alter table public.study_items enable row level security;
create policy "own study items" on public.study_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

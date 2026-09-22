-- Carpetas: las secciones pueden colgar de otra sección, así los apuntes se organizan en árbol.
alter table public.note_sections add column if not exists parent_id uuid references public.note_sections on delete cascade;
create index if not exists note_sections_parent_idx on public.note_sections (parent_id, position);

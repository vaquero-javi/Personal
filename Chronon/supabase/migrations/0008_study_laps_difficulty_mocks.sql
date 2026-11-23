-- Estudio: vueltas al temario, dificultad (semáforo) de cada tema y simulacros con IA.

-- Dificultad del tema (semáforo de retención). Sin poner cuenta como media.
-- base_minutes: estimación del tema a dificultad media; minutes sigue siendo lo que dura la 1ª vuelta.
alter table public.study_topics
  add column if not exists difficulty   text check (difficulty in ('easy', 'medium', 'hard')),
  add column if not exists base_minutes integer check (base_minutes > 0);

-- Vuelta al temario de cada sesión de estudio (1 = primera vez).
alter table public.events
  add column if not exists study_lap smallint check (study_lap > 0);

-- Simulacros de examen generados con IA a partir de los PDFs de los temas estudiados.
-- content: { questions: [...] } · score: aciertos en las de tipo test (null hasta corregir).
create table if not exists public.study_mocks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id    uuid not null references public.study_plans on delete cascade,
  title      text not null default 'Simulacro',
  topic_ids  uuid[] not null default '{}',
  content    jsonb not null,
  score      integer,
  total      integer,
  created_at timestamptz not null default now()
);
create index if not exists study_mocks_plan_idx on public.study_mocks (plan_id, created_at desc);

alter table public.study_mocks enable row level security;
create policy "own study mocks" on public.study_mocks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

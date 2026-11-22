-- Planes de estudio (estilo Opozulo): un examen, sus temas y las sesiones que se ponen en el calendario.
-- settings: { startDate, startTime, hoursByWeekday[7] (lunes primero), finalReviewDays, minutesPerPage }
create table if not exists public.study_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title      text not null,
  exam_date  date not null,
  color      text not null default '#3b6ea8',
  -- Carpeta de Documentos donde se subieron los PDFs del plan.
  section_id uuid references public.note_sections on delete set null,
  settings   jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists study_plans_user_idx on public.study_plans (user_id, exam_date);

create table if not exists public.study_topics (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id    uuid not null references public.study_plans on delete cascade,
  -- Documento (PDF) del tema; el tema sigue existiendo si se borra el documento.
  note_id    uuid references public.notes on delete set null,
  title      text not null,
  position   integer not null default 0,
  pages      integer,
  -- Tiempo estimado para estudiarlo la primera vez.
  minutes    integer not null check (minutes > 0),
  created_at timestamptz not null default now()
);
create index if not exists study_topics_plan_idx on public.study_topics (plan_id, position);

-- Cada sesión del plan es un evento normal del calendario; al borrar el plan se van con él.
alter table public.events
  add column if not exists study_plan_id  uuid references public.study_plans on delete cascade,
  add column if not exists study_topic_id uuid references public.study_topics on delete cascade,
  add column if not exists study_kind     text check (study_kind in ('study', 'review', 'final', 'mock', 'exam'));
create index if not exists events_study_plan_idx on public.events (study_plan_id, start_at) where study_plan_id is not null;
create index if not exists events_study_topic_idx on public.events (study_topic_id) where study_topic_id is not null;

alter table public.study_plans  enable row level security;
alter table public.study_topics enable row level security;
create policy "own study plans" on public.study_plans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own study topics" on public.study_topics
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

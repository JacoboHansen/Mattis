-- Mattis PoC schema v0.1
-- Engineering baseline only. Run against a local Supabase project first.
-- Every exposed table has RLS. Do not use the secret/service key in browser code.

create extension if not exists pgcrypto;

create type public.session_status as enum (
  'planned', 'capturing', 'parsing', 'reviewing', 'active', 'summarizing', 'completed', 'cancelled'
);

create type public.task_status as enum (
  'detected', 'confirmed', 'in_progress', 'checking', 'completed', 'skipped'
);

create type public.message_role as enum ('student', 'tutor', 'system');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  grade_level smallint check (grade_level between 1 and 13),
  course_code text,
  weekly_goal_minutes smallint not null default 120 check (weekly_goal_minutes between 10 and 1000),
  locale text not null default 'nb-NO',
  timezone text not null default 'Europe/Oslo',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.curriculum_concepts (
  concept_key text primary key,
  title_nb text not null,
  description_nb text,
  grade_min smallint,
  grade_max smallint,
  prerequisite_keys text[] not null default '{}',
  curriculum_version text not null,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.session_status not null default 'planned',
  current_phase text not null default 'homework',
  planned_at timestamptz,
  duration_minutes smallint not null default 45 check (duration_minutes between 10 and 180),
  started_at timestamptz,
  ended_at timestamptz,
  summary_nb text,
  next_topic_nb text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_id_user_unique unique (id, user_id)
);

create table public.homework_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  width_px integer,
  height_px integer,
  byte_size integer check (byte_size > 0 and byte_size <= 10485760),
  sha256 text,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'parsed', 'failed', 'deleted')),
  page_number smallint not null default 1 check (page_number > 0),
  delete_after timestamptz not null default (now() + interval '24 hours'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint homework_uploads_id_user_unique unique (id, user_id),
  constraint homework_uploads_session_owner_fk
    foreign key (session_id, user_id)
    references public.sessions(id, user_id)
    on delete cascade
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  upload_id uuid,
  sequence_no smallint not null check (sequence_no > 0),
  source_label text,
  source_text text not null,
  normalized_text text not null,
  task_type text not null,
  concept_keys text[] not null default '{}',
  figure_spec jsonb,
  parse_confidence numeric(4,3) not null default 0 check (parse_confidence between 0 and 1),
  status public.task_status not null default 'detected',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, sequence_no),
  constraint tasks_id_user_unique unique (id, user_id),
  constraint tasks_session_owner_fk
    foreign key (session_id, user_id)
    references public.sessions(id, user_id)
    on delete cascade,
  constraint tasks_upload_owner_fk
    foreign key (upload_id, user_id)
    references public.homework_uploads(id, user_id)
    on delete set null (upload_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  task_id uuid,
  role public.message_role not null,
  content_nb text not null check (char_length(content_nb) between 1 and 8000),
  intent text,
  client_message_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique (user_id, client_message_id),
  constraint messages_session_owner_fk
    foreign key (session_id, user_id)
    references public.sessions(id, user_id)
    on delete cascade,
  constraint messages_task_owner_fk
    foreign key (task_id, user_id)
    references public.tasks(id, user_id)
    on delete set null (task_id)
);

create table public.learning_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  task_id uuid,
  concept_key text not null references public.curriculum_concepts(concept_key) on update cascade,
  evidence_type text not null check (evidence_type in ('correct', 'self_corrected', 'hinted', 'misconception', 'explained', 'skipped')),
  score numeric(4,3) not null check (score between 0 and 1),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  misconception_code text,
  note_nb text check (char_length(note_nb) <= 500),
  created_at timestamptz not null default now(),
  constraint learning_evidence_session_owner_fk
    foreign key (session_id, user_id)
    references public.sessions(id, user_id)
    on delete cascade,
  constraint learning_evidence_task_owner_fk
    foreign key (task_id, user_id)
    references public.tasks(id, user_id)
    on delete set null (task_id)
);

create table public.mastery (
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_key text not null references public.curriculum_concepts(concept_key) on update cascade,
  estimate numeric(4,3) not null default 0.5 check (estimate between 0 and 1),
  confidence numeric(4,3) not null default 0.1 check (confidence between 0 and 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  last_practiced_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_key)
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes smallint not null default 45 check (duration_minutes between 10 and 180),
  focus_nb text,
  recurrence_rule text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  task_id uuid,
  capability text not null check (capability in ('homework_parser', 'tutor', 'figure_generator')),
  provider text not null,
  model text not null,
  request_schema_version text not null,
  response_schema_version text not null,
  prompt_hash text,
  latency_ms integer check (latency_ms >= 0),
  input_units integer check (input_units >= 0),
  output_units integer check (output_units >= 0),
  estimated_cost_usd numeric(12,6),
  status text not null check (status in ('succeeded', 'failed', 'blocked', 'cancelled')),
  safety_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint ai_generations_session_owner_fk
    foreign key (session_id, user_id)
    references public.sessions(id, user_id)
    on delete set null (session_id),
  constraint ai_generations_task_owner_fk
    foreign key (task_id, user_id)
    references public.tasks(id, user_id)
    on delete set null (task_id)
);

create table public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  session_id uuid,
  event_name text not null,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  constraint product_events_session_requires_owner check (session_id is null or user_id is not null),
  constraint product_events_session_owner_fk
    foreign key (session_id, user_id)
    references public.sessions(id, user_id)
    on delete cascade
);

create index sessions_user_created_idx on public.sessions (user_id, created_at desc);
create index homework_uploads_user_session_idx on public.homework_uploads (user_id, session_id);
create index homework_uploads_session_user_fk_idx on public.homework_uploads (session_id, user_id);
create index homework_uploads_delete_after_idx on public.homework_uploads (delete_after) where deleted_at is null;
create index tasks_user_session_idx on public.tasks (user_id, session_id, sequence_no);
create index tasks_session_user_fk_idx on public.tasks (session_id, user_id);
create index tasks_upload_user_fk_idx on public.tasks (upload_id, user_id);
create index tasks_upload_idx on public.tasks (upload_id) where upload_id is not null;
create index tasks_concepts_gin_idx on public.tasks using gin (concept_keys);
create index messages_user_session_created_idx on public.messages (user_id, session_id, created_at);
create index messages_session_user_fk_idx on public.messages (session_id, user_id);
create index messages_task_user_fk_idx on public.messages (task_id, user_id);
create index messages_task_idx on public.messages (task_id) where task_id is not null;
create index messages_expires_idx on public.messages (expires_at);
create index learning_evidence_concept_key_fk_idx on public.learning_evidence (concept_key);
create index learning_evidence_user_concept_idx on public.learning_evidence (user_id, concept_key, created_at desc);
create index learning_evidence_user_session_idx on public.learning_evidence (user_id, session_id);
create index learning_evidence_session_user_fk_idx on public.learning_evidence (session_id, user_id);
create index learning_evidence_task_user_fk_idx on public.learning_evidence (task_id, user_id);
create index learning_evidence_task_idx on public.learning_evidence (task_id) where task_id is not null;
create index mastery_concept_idx on public.mastery (concept_key);
create index schedules_user_starts_idx on public.schedules (user_id, starts_at);
create index ai_generations_user_created_idx on public.ai_generations (user_id, created_at desc);
create index ai_generations_user_session_idx on public.ai_generations (user_id, session_id) where session_id is not null;
create index ai_generations_session_user_fk_idx on public.ai_generations (session_id, user_id);
create index ai_generations_task_user_fk_idx on public.ai_generations (task_id, user_id);
create index ai_generations_task_idx on public.ai_generations (task_id) where task_id is not null;
create index product_events_user_created_idx on public.product_events (user_id, created_at desc) where user_id is not null;
create index product_events_user_session_idx on public.product_events (user_id, session_id) where session_id is not null;
create index product_events_session_user_fk_idx on public.product_events (session_id, user_id);
create index product_events_expires_idx on public.product_events (expires_at);

alter table public.profiles enable row level security;
alter table public.curriculum_concepts enable row level security;
alter table public.sessions enable row level security;
alter table public.homework_uploads enable row level security;
alter table public.tasks enable row level security;
alter table public.messages enable row level security;
alter table public.learning_evidence enable row level security;
alter table public.mastery enable row level security;
alter table public.schedules enable row level security;
alter table public.ai_generations enable row level security;
alter table public.product_events enable row level security;

-- Supabase projects created after the 2026 Data API default change require explicit grants.
-- Revoke anonymous access first so the intended authenticated-only surface is deterministic on
-- both older and newer project defaults.
revoke all on public.profiles, public.curriculum_concepts, public.sessions,
  public.homework_uploads, public.tasks, public.messages, public.learning_evidence,
  public.mastery, public.schedules, public.ai_generations, public.product_events from anon;

grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.curriculum_concepts to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.homework_uploads to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.learning_evidence to authenticated;
grant select, insert, update, delete on public.mastery to authenticated;
grant select, insert, update, delete on public.schedules to authenticated;
grant select, insert on public.ai_generations to authenticated;
grant select, insert on public.product_events to authenticated;
grant usage, select on sequence public.product_events_id_seq to authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy "concepts_read_authenticated" on public.curriculum_concepts for select to authenticated using (true);

create policy "sessions_select_own" on public.sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "sessions_insert_own" on public.sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sessions_update_own" on public.sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sessions_delete_own" on public.sessions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "uploads_select_own" on public.homework_uploads for select to authenticated using ((select auth.uid()) = user_id);
create policy "uploads_insert_own" on public.homework_uploads for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "uploads_update_own" on public.homework_uploads for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "uploads_delete_own" on public.homework_uploads for delete to authenticated using ((select auth.uid()) = user_id);

create policy "tasks_select_own" on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks_insert_own" on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tasks_update_own" on public.tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks_delete_own" on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);

create policy "messages_select_own" on public.messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "messages_insert_own" on public.messages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "messages_update_own" on public.messages for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "messages_delete_own" on public.messages for delete to authenticated using ((select auth.uid()) = user_id);

create policy "evidence_select_own" on public.learning_evidence for select to authenticated using ((select auth.uid()) = user_id);
create policy "evidence_insert_own" on public.learning_evidence for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "evidence_update_own" on public.learning_evidence for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "evidence_delete_own" on public.learning_evidence for delete to authenticated using ((select auth.uid()) = user_id);

create policy "mastery_select_own" on public.mastery for select to authenticated using ((select auth.uid()) = user_id);
create policy "mastery_insert_own" on public.mastery for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "mastery_update_own" on public.mastery for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "mastery_delete_own" on public.mastery for delete to authenticated using ((select auth.uid()) = user_id);

create policy "schedules_select_own" on public.schedules for select to authenticated using ((select auth.uid()) = user_id);
create policy "schedules_insert_own" on public.schedules for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "schedules_update_own" on public.schedules for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "schedules_delete_own" on public.schedules for delete to authenticated using ((select auth.uid()) = user_id);

create policy "ai_generations_select_own" on public.ai_generations for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_generations_insert_own" on public.ai_generations for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "product_events_select_own" on public.product_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "product_events_insert_own" on public.product_events for insert to authenticated with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homework-private',
  'homework-private',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "homework_objects_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'homework-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "homework_objects_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'homework-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "homework_objects_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'homework-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'homework-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "homework_objects_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'homework-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Expected object key:
--   <auth.uid()>/<session_id>/<upload_id>.<ext>
-- A scheduled server-side cleanup must delete expired objects and set deleted_at.
-- Before a real pilot, verify this migration with Supabase local tests and db advisors.

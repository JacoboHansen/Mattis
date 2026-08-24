-- Family accounts: one authenticated parent owns one or more learner profiles.
-- Learner profiles intentionally contain only learning preferences and a display name;
-- children do not receive separate email accounts or stored passwords.

create table if not exists public.parent_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learner_profiles (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  grade_level smallint check (grade_level between 1 and 13),
  course_code text,
  weekly_goal_minutes smallint not null default 120 check (weekly_goal_minutes between 10 and 1000),
  locale text not null default 'nb-NO',
  timezone text not null default 'Europe/Oslo',
  onboarding_completed_at timestamptz,
  learner_profile_status text not null default 'not_started'
    check (learner_profile_status in ('not_started', 'in_progress', 'complete')),
  preferred_session_minutes smallint
    check (preferred_session_minutes is null or preferred_session_minutes between 10 and 180),
  preferred_weekly_sessions smallint
    check (preferred_weekly_sessions is null or preferred_weekly_sessions between 1 and 7),
  learning_style text
    check (learning_style is null or learning_style in ('step_by_step', 'examples_first', 'independent', 'mixed')),
  strength_concept_keys text[] not null default '{}',
  focus_concept_keys text[] not null default '{}',
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(strength_concept_keys) <= 8),
  check (cardinality(focus_concept_keys) <= 8),
  unique (parent_user_id, display_name)
);

comment on table public.parent_accounts is 'Authenticated account owner; billing and parent settings belong here.';
comment on table public.learner_profiles is 'Minimal child profile under a parent account. No child email or password is stored.';

insert into public.parent_accounts (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

insert into public.learner_profiles (
  id,
  parent_user_id,
  display_name,
  grade_level,
  course_code,
  weekly_goal_minutes,
  locale,
  timezone,
  onboarding_completed_at,
  learner_profile_status,
  preferred_session_minutes,
  preferred_weekly_sessions,
  learning_style,
  strength_concept_keys,
  focus_concept_keys,
  sort_order
)
select
  p.id,
  p.id,
  p.display_name,
  p.grade_level,
  p.course_code,
  p.weekly_goal_minutes,
  p.locale,
  p.timezone,
  p.onboarding_completed_at,
  p.learner_profile_status,
  p.preferred_session_minutes,
  p.preferred_weekly_sessions,
  p.learning_style,
  p.strength_concept_keys,
  p.focus_concept_keys,
  0
from public.profiles p
on conflict (id) do nothing;

alter table public.sessions add column if not exists learner_id uuid;
alter table public.homework_uploads add column if not exists learner_id uuid;
alter table public.tasks add column if not exists learner_id uuid;
alter table public.messages add column if not exists learner_id uuid;
alter table public.learning_evidence add column if not exists learner_id uuid;
alter table public.mastery add column if not exists learner_id uuid;
alter table public.schedules add column if not exists learner_id uuid;
alter table public.ai_generations add column if not exists learner_id uuid;
alter table public.product_events add column if not exists learner_id uuid;

update public.sessions set learner_id = user_id where learner_id is null;
update public.homework_uploads set learner_id = user_id where learner_id is null;
update public.tasks set learner_id = user_id where learner_id is null;
update public.messages set learner_id = user_id where learner_id is null;
update public.learning_evidence set learner_id = user_id where learner_id is null;
update public.mastery set learner_id = user_id where learner_id is null;
update public.schedules set learner_id = user_id where learner_id is null;
update public.ai_generations set learner_id = user_id where learner_id is null;
update public.product_events set learner_id = user_id where learner_id is null;

alter table public.sessions alter column learner_id set not null;
alter table public.homework_uploads alter column learner_id set not null;
alter table public.tasks alter column learner_id set not null;
alter table public.messages alter column learner_id set not null;
alter table public.learning_evidence alter column learner_id set not null;
alter table public.mastery alter column learner_id set not null;
alter table public.schedules alter column learner_id set not null;
alter table public.ai_generations alter column learner_id set not null;

alter table public.sessions
  add constraint sessions_learner_id_fkey foreign key (learner_id)
  references public.learner_profiles(id) on delete cascade;
alter table public.homework_uploads
  add constraint homework_uploads_learner_id_fkey foreign key (learner_id)
  references public.learner_profiles(id) on delete cascade;
alter table public.tasks
  add constraint tasks_learner_id_fkey foreign key (learner_id)
  references public.learner_profiles(id) on delete cascade;
alter table public.messages
  add constraint messages_learner_id_fkey foreign key (learner_id)
  references public.learner_profiles(id) on delete cascade;
alter table public.learning_evidence
  add constraint learning_evidence_learner_id_fkey foreign key (learner_id)
  references public.learner_profiles(id) on delete cascade;
alter table public.mastery
  add constraint mastery_learner_id_fkey foreign key (learner_id)
  references public.learner_profiles(id) on delete cascade;
alter table public.schedules
  add constraint schedules_learner_id_fkey foreign key (learner_id)
  references public.learner_profiles(id) on delete cascade;
alter table public.ai_generations
  add constraint ai_generations_learner_id_fkey foreign key (learner_id)
  references public.learner_profiles(id) on delete cascade;
alter table public.product_events
  add constraint product_events_learner_id_fkey foreign key (learner_id)
  references public.learner_profiles(id) on delete cascade;

alter table public.mastery drop constraint if exists mastery_pkey;
alter table public.mastery add constraint mastery_pkey primary key (learner_id, concept_key);

create index if not exists learner_profiles_parent_sort_idx
  on public.learner_profiles (parent_user_id, sort_order, created_at);
create index if not exists sessions_parent_learner_created_idx
  on public.sessions (user_id, learner_id, created_at desc);
create index if not exists homework_uploads_parent_learner_created_idx
  on public.homework_uploads (user_id, learner_id, created_at desc);
create index if not exists tasks_parent_learner_created_idx
  on public.tasks (user_id, learner_id, created_at desc);
create index if not exists messages_parent_learner_created_idx
  on public.messages (user_id, learner_id, created_at);
create index if not exists evidence_parent_learner_created_idx
  on public.learning_evidence (user_id, learner_id, created_at desc);
create index if not exists mastery_learner_updated_idx
  on public.mastery (learner_id, updated_at desc);
create index if not exists schedules_parent_learner_starts_idx
  on public.schedules (user_id, learner_id, starts_at);
create index if not exists ai_generations_parent_learner_created_idx
  on public.ai_generations (user_id, learner_id, created_at desc);
create index if not exists product_events_parent_learner_created_idx
  on public.product_events (user_id, learner_id, created_at desc);

alter table public.parent_accounts enable row level security;
alter table public.learner_profiles enable row level security;

drop policy if exists parent_accounts_select_own on public.parent_accounts;
drop policy if exists parent_accounts_insert_own on public.parent_accounts;
drop policy if exists parent_accounts_update_own on public.parent_accounts;
create policy parent_accounts_select_own on public.parent_accounts
  for select using ((select auth.uid()) = user_id);
create policy parent_accounts_insert_own on public.parent_accounts
  for insert with check ((select auth.uid()) = user_id);
create policy parent_accounts_update_own on public.parent_accounts
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists learner_profiles_select_own on public.learner_profiles;
drop policy if exists learner_profiles_insert_own on public.learner_profiles;
drop policy if exists learner_profiles_update_own on public.learner_profiles;
drop policy if exists learner_profiles_delete_own on public.learner_profiles;
create policy learner_profiles_select_own on public.learner_profiles
  for select using ((select auth.uid()) = parent_user_id);
create policy learner_profiles_insert_own on public.learner_profiles
  for insert with check ((select auth.uid()) = parent_user_id);
create policy learner_profiles_update_own on public.learner_profiles
  for update using ((select auth.uid()) = parent_user_id)
  with check ((select auth.uid()) = parent_user_id);
create policy learner_profiles_delete_own on public.learner_profiles
  for delete using ((select auth.uid()) = parent_user_id);

-- All learning rows remain owned by the authenticated parent, but are now also
-- isolated to the selected learner profile.
drop policy if exists sessions_select_own on public.sessions;
drop policy if exists sessions_insert_own on public.sessions;
drop policy if exists sessions_update_own on public.sessions;
drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_select_own on public.sessions for select using (
  (select auth.uid()) = user_id and exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_id and lp.parent_user_id = (select auth.uid())
  )
);
create policy sessions_insert_own on public.sessions for insert with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_id and lp.parent_user_id = (select auth.uid())
  )
);
create policy sessions_update_own on public.sessions for update using (
  (select auth.uid()) = user_id and exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_id and lp.parent_user_id = (select auth.uid())
  )
) with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_id and lp.parent_user_id = (select auth.uid())
  )
);
create policy sessions_delete_own on public.sessions for delete using (
  (select auth.uid()) = user_id and exists (
    select 1 from public.learner_profiles lp
    where lp.id = learner_id and lp.parent_user_id = (select auth.uid())
  )
);

drop policy if exists uploads_select_own on public.homework_uploads;
drop policy if exists uploads_insert_own on public.homework_uploads;
drop policy if exists uploads_update_own on public.homework_uploads;
drop policy if exists uploads_delete_own on public.homework_uploads;
create policy uploads_select_own on public.homework_uploads for select using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy uploads_insert_own on public.homework_uploads for insert with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy uploads_update_own on public.homework_uploads for update using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
) with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy uploads_delete_own on public.homework_uploads for delete using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);

drop policy if exists tasks_select_own on public.tasks;
drop policy if exists tasks_insert_own on public.tasks;
drop policy if exists tasks_update_own on public.tasks;
drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_select_own on public.tasks for select using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy tasks_insert_own on public.tasks for insert with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy tasks_update_own on public.tasks for update using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
) with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy tasks_delete_own on public.tasks for delete using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);

drop policy if exists messages_select_own on public.messages;
drop policy if exists messages_insert_own on public.messages;
drop policy if exists messages_update_own on public.messages;
drop policy if exists messages_delete_own on public.messages;
create policy messages_select_own on public.messages for select using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy messages_insert_own on public.messages for insert with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy messages_update_own on public.messages for update using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
) with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy messages_delete_own on public.messages for delete using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);

drop policy if exists evidence_select_own on public.learning_evidence;
drop policy if exists evidence_insert_own on public.learning_evidence;
drop policy if exists evidence_update_own on public.learning_evidence;
drop policy if exists evidence_delete_own on public.learning_evidence;
create policy evidence_select_own on public.learning_evidence for select using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy evidence_insert_own on public.learning_evidence for insert with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy evidence_update_own on public.learning_evidence for update using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
) with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy evidence_delete_own on public.learning_evidence for delete using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);

drop policy if exists mastery_select_own on public.mastery;
drop policy if exists mastery_insert_own on public.mastery;
drop policy if exists mastery_update_own on public.mastery;
drop policy if exists mastery_delete_own on public.mastery;
create policy mastery_select_own on public.mastery for select using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy mastery_insert_own on public.mastery for insert with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy mastery_update_own on public.mastery for update using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
) with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy mastery_delete_own on public.mastery for delete using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);

drop policy if exists schedules_select_own on public.schedules;
drop policy if exists schedules_insert_own on public.schedules;
drop policy if exists schedules_update_own on public.schedules;
drop policy if exists schedules_delete_own on public.schedules;
create policy schedules_select_own on public.schedules for select using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy schedules_insert_own on public.schedules for insert with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy schedules_update_own on public.schedules for update using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
) with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy schedules_delete_own on public.schedules for delete using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);

drop policy if exists ai_generations_select_own on public.ai_generations;
drop policy if exists ai_generations_insert_own on public.ai_generations;
create policy ai_generations_select_own on public.ai_generations for select using (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy ai_generations_insert_own on public.ai_generations for insert with check (
  (select auth.uid()) = user_id and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);

drop policy if exists product_events_select_own on public.product_events;
drop policy if exists product_events_insert_own on public.product_events;
create policy product_events_select_own on public.product_events for select using (
  (select auth.uid()) = user_id and learner_id is not null and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);
create policy product_events_insert_own on public.product_events for insert with check (
  (select auth.uid()) = user_id and learner_id is not null and exists (select 1 from public.learner_profiles lp where lp.id = learner_id and lp.parent_user_id = (select auth.uid()))
);

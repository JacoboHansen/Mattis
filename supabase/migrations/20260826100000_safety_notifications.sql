-- Safety signals are deliberately narrow and contain no message text,
-- diagnosis, mood score, or model explanation.

create table if not exists public.parent_safety_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  consented_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.learner_profiles
  drop constraint if exists learner_profiles_id_parent_user_unique,
  add constraint learner_profiles_id_parent_user_unique unique (id, parent_user_id);

create table if not exists public.safety_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  learner_id uuid not null references public.learner_profiles(id) on delete cascade,
  session_id uuid,
  signal_code text not null check (signal_code in ('distress', 'self_harm', 'abuse', 'immediate_danger')),
  level text not null check (level in ('support', 'urgent')),
  notification_status text not null default 'suppressed'
    check (notification_status in ('suppressed', 'pending', 'sent', 'failed', 'not_configured')),
  notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint safety_events_learner_owner_fk
    foreign key (learner_id, user_id)
    references public.learner_profiles(id, parent_user_id)
    on delete cascade,
  constraint safety_events_session_owner_fk
    foreign key (session_id, user_id)
    references public.sessions(id, user_id)
    on delete set null
);

create index if not exists safety_events_learner_created_idx
  on public.safety_events (user_id, learner_id, signal_code, created_at desc);

alter table public.parent_safety_preferences enable row level security;
alter table public.safety_events enable row level security;

drop policy if exists parent_safety_preferences_select_own on public.parent_safety_preferences;
drop policy if exists parent_safety_preferences_insert_own on public.parent_safety_preferences;
drop policy if exists parent_safety_preferences_update_own on public.parent_safety_preferences;
create policy parent_safety_preferences_select_own on public.parent_safety_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy parent_safety_preferences_insert_own on public.parent_safety_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy parent_safety_preferences_update_own on public.parent_safety_preferences
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Safety events are written and read only by server-side code using the
-- Supabase secret key. They are never available to the browser role.
revoke all on public.safety_events from anon, authenticated;
grant all on public.safety_events to service_role;

grant select, insert, update on public.parent_safety_preferences to authenticated;

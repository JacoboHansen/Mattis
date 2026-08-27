-- Parent-owned age, onboarding intake and pending learner payment state.
alter table public.learner_profiles
  add column if not exists age_band text,
  add column if not exists parent_together_confirmed boolean not null default false,
  add column if not exists safety_acknowledged_at timestamptz,
  add column if not exists intake_step text not null default 'goal',
  add column if not exists intake_data jsonb not null default '{}'::jsonb,
  add column if not exists created_from_pending_id uuid;

alter table public.learner_profiles
  drop constraint if exists learner_profiles_age_band_check,
  add constraint learner_profiles_age_band_check
    check (age_band is null or age_band in ('under_12', '12_16', '17_plus'));

create unique index if not exists learner_profiles_created_from_pending_uidx
  on public.learner_profiles (created_from_pending_id)
  where created_from_pending_id is not null;

create table if not exists public.pending_learners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  grade_level integer not null check (grade_level between 1 and 13),
  course_code text not null,
  age_band text not null check (age_band in ('under_12', '12_16', '17_plus')),
  parent_together_confirmed boolean not null default false,
  stripe_subscription_id text,
  stripe_invoice_id text unique,
  learner_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pending_learners_user_status_idx
  on public.pending_learners (user_id, status, created_at desc);
create index if not exists pending_learners_subscription_idx
  on public.pending_learners (stripe_subscription_id, status);

alter table public.pending_learners enable row level security;
revoke all on public.pending_learners from anon, authenticated;
grant all on public.pending_learners to service_role;

-- Minor concerns such as bullying may require a child consent step for ages 12–16.
alter table public.safety_events
  drop constraint if exists safety_events_signal_code_check,
  add constraint safety_events_signal_code_check
    check (signal_code in ('distress', 'bullying', 'self_harm', 'abuse', 'immediate_danger')),
  drop constraint if exists safety_events_notification_status_check,
  add constraint safety_events_notification_status_check
    check (notification_status in ('suppressed', 'pending', 'sent', 'failed', 'not_configured', 'awaiting_child_consent'));

alter table public.safety_events
  add column if not exists consented_at timestamptz;

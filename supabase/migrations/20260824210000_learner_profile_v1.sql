-- Mattis learner profile v1.
--
-- Store only small, pedagogical preferences and controlled curriculum keys.
-- Do not put chat text, free-form notes, names or contact details here.

alter table public.profiles
  add column if not exists learner_profile_status text not null default 'not_started',
  add column if not exists preferred_session_minutes smallint,
  add column if not exists preferred_weekly_sessions smallint,
  add column if not exists learning_style text,
  add column if not exists strength_concept_keys text[] not null default '{}',
  add column if not exists focus_concept_keys text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_learner_profile_status_check,
  add constraint profiles_learner_profile_status_check
    check (learner_profile_status in ('not_started', 'in_progress', 'complete')),
  drop constraint if exists profiles_preferred_session_minutes_check,
  add constraint profiles_preferred_session_minutes_check
    check (preferred_session_minutes is null or preferred_session_minutes between 10 and 180),
  drop constraint if exists profiles_preferred_weekly_sessions_check,
  add constraint profiles_preferred_weekly_sessions_check
    check (preferred_weekly_sessions is null or preferred_weekly_sessions between 1 and 7),
  drop constraint if exists profiles_learning_style_check,
  add constraint profiles_learning_style_check
    check (learning_style is null or learning_style in ('step_by_step', 'examples_first', 'independent', 'mixed')),
  drop constraint if exists profiles_strength_concept_keys_check,
  add constraint profiles_strength_concept_keys_check
    check (cardinality(strength_concept_keys) <= 8),
  drop constraint if exists profiles_focus_concept_keys_check,
  add constraint profiles_focus_concept_keys_check
    check (cardinality(focus_concept_keys) <= 8);

comment on column public.profiles.learner_profile_status is
  'Progress for the short chat-based learner discovery flow; not a personal-data field.';
comment on column public.profiles.preferred_session_minutes is
  'Optional preferred study session length in minutes.';
comment on column public.profiles.preferred_weekly_sessions is
  'Optional preferred number of study sessions per week.';
comment on column public.profiles.learning_style is
  'Controlled pedagogical preference, never free-form learner text.';
comment on column public.profiles.strength_concept_keys is
  'Controlled curriculum keys the learner says feel relatively safe.';
comment on column public.profiles.focus_concept_keys is
  'Controlled curriculum keys the learner says they want to improve.';

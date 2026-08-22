-- GDPR hardening for real tutor sessions.
--
-- The baseline schema already owns row isolation for sessions, messages and
-- learning_evidence. This migration makes the session retention decision
-- explicit so a cleanup worker can delete an entire session tree safely.
-- No privileged cleanup function or developer bypass is exposed here.

alter table public.sessions
  add column if not exists delete_after timestamptz;

update public.sessions
set delete_after = created_at + interval '180 days'
where delete_after is null;

alter table public.sessions
  alter column delete_after set default (now() + interval '180 days'),
  alter column delete_after set not null;

alter table public.sessions
  drop constraint if exists sessions_delete_after_bounds;

alter table public.sessions
  add constraint sessions_delete_after_bounds
  check (
    delete_after >= created_at
    and delete_after <= created_at + interval '180 days'
  );

-- Retention metadata and insertion timestamps are server-owned. Keep the
-- student write surface limited to state/content fields; RLS still scopes all
-- of those writes to auth.uid().
revoke update on public.sessions from authenticated;
grant update (
  status,
  current_phase,
  planned_at,
  duration_minutes,
  started_at,
  ended_at,
  summary_nb,
  next_topic_nb,
  updated_at
) on public.sessions to authenticated;

-- Keep timestamps and the retention deadline database-owned on inserts too.
revoke insert on public.sessions from authenticated;
grant insert (
  user_id,
  status,
  current_phase,
  planned_at,
  duration_minutes,
  started_at,
  ended_at,
  summary_nb,
  next_topic_nb
) on public.sessions to authenticated;

revoke insert on public.messages, public.learning_evidence from authenticated;
grant insert (
  user_id,
  session_id,
  task_id,
  role,
  content_nb,
  intent,
  client_message_id
) on public.messages to authenticated;
grant insert (
  user_id,
  session_id,
  task_id,
  concept_key,
  evidence_type,
  score,
  confidence,
  misconception_code,
  note_nb
) on public.learning_evidence to authenticated;

-- Tutor turns are append-only. Deleting a session remains available through
-- the owner policy and cascades the short-lived conversation data.
revoke update on public.messages, public.learning_evidence from authenticated;

create index if not exists sessions_delete_after_idx
  on public.sessions (delete_after);

comment on column public.sessions.delete_after is
  'UTC retention deadline for the session and its cascaded child data; cleanup is a separate reviewed job.';

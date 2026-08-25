-- The learning-loop migrations intentionally restrict inserts to an explicit
-- column allowlist. Add the new learner scope columns to that allowlist.
-- Without this, PostgREST reports a generic "permission denied for table"
-- when a new scoped message/session/evidence row is inserted.

grant insert (
  user_id,
  learner_id,
  status,
  current_phase,
  planned_at,
  duration_minutes,
  started_at,
  ended_at,
  summary_nb,
  next_topic_nb,
  plan_snapshot
) on public.sessions to authenticated;

grant insert (
  user_id,
  learner_id,
  session_id,
  task_id,
  role,
  content_nb,
  intent,
  client_message_id,
  metadata
) on public.messages to authenticated;

grant insert (
  user_id,
  learner_id,
  session_id,
  task_id,
  concept_key,
  evidence_type,
  score,
  confidence,
  misconception_code,
  note_nb,
  source_message_id
) on public.learning_evidence to authenticated;

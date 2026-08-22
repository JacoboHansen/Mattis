-- Cover the composite owner-scoped foreign key used by tutor evidence.
drop index if exists public.learning_evidence_source_message_idx;

create index if not exists learning_evidence_source_message_owner_idx
  on public.learning_evidence (source_message_id, user_id)
  where source_message_id is not null;

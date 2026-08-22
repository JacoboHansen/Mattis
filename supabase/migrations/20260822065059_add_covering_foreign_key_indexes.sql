-- Cover composite foreign keys in the same column order reported by the database advisor.
create index homework_uploads_session_user_fk_idx on public.homework_uploads (session_id, user_id);
create index tasks_session_user_fk_idx on public.tasks (session_id, user_id);
create index tasks_upload_user_fk_idx on public.tasks (upload_id, user_id);
create index messages_session_user_fk_idx on public.messages (session_id, user_id);
create index messages_task_user_fk_idx on public.messages (task_id, user_id);
create index learning_evidence_concept_key_fk_idx on public.learning_evidence (concept_key);
create index learning_evidence_session_user_fk_idx on public.learning_evidence (session_id, user_id);
create index learning_evidence_task_user_fk_idx on public.learning_evidence (task_id, user_id);
create index ai_generations_session_user_fk_idx on public.ai_generations (session_id, user_id);
create index ai_generations_task_user_fk_idx on public.ai_generations (task_id, user_id);
create index product_events_session_user_fk_idx on public.product_events (session_id, user_id);


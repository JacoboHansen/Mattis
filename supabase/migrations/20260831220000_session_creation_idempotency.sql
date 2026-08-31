-- Retrying the start action must reuse the same session and opening message.
alter table public.sessions
  add column if not exists creation_key uuid;

create unique index if not exists sessions_user_creation_key_uidx
  on public.sessions (user_id, creation_key)
  where creation_key is not null;

comment on column public.sessions.creation_key is
  'Client-generated UUID used to make session creation safe to retry.';

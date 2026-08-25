-- Safety events follow the same retention boundary as their source session.
alter table public.safety_events
  drop constraint if exists safety_events_session_owner_fk,
  add constraint safety_events_session_owner_fk
    foreign key (session_id, user_id)
    references public.sessions(id, user_id)
    on delete cascade;

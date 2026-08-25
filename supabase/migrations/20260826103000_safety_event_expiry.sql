alter table public.safety_events
  add column if not exists delete_after timestamptz;

update public.safety_events
set delete_after = created_at + interval '30 days'
where delete_after is null;

alter table public.safety_events
  alter column delete_after set default (now() + interval '30 days'),
  alter column delete_after set not null;

alter table public.safety_events
  drop constraint if exists safety_events_delete_after_bounds,
  add constraint safety_events_delete_after_bounds
    check (delete_after >= created_at and delete_after <= created_at + interval '30 days');

create index if not exists safety_events_delete_after_idx
  on public.safety_events (delete_after);

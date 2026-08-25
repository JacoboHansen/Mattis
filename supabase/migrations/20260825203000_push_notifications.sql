-- Background PWA notifications for planned sessions.
--
-- Push subscriptions are account-level, not learner-level. The payload sent by
-- the notification worker is intentionally generic and contains no student data.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.push_subscriptions enable row level security;

grant select on public.push_subscriptions to authenticated;
grant insert (
  user_id,
  endpoint,
  p256dh,
  auth,
  user_agent
) on public.push_subscriptions to authenticated;
grant update (
  endpoint,
  p256dh,
  auth,
  user_agent,
  updated_at,
  last_used_at
) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own
  on public.push_subscriptions
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- One planned session represents one notification. Recurring schedules point to
-- each generated session so the cron worker can advance them safely.
alter table public.sessions
  add column if not exists schedule_id uuid references public.schedules(id) on delete set null,
  add column if not exists reminder_sent_at timestamptz;

create index if not exists sessions_planned_reminder_idx
  on public.sessions (planned_at)
  where status = 'planned' and reminder_sent_at is null;

create index if not exists sessions_schedule_id_idx
  on public.sessions (schedule_id);

create unique index if not exists sessions_schedule_planned_unique
  on public.sessions (schedule_id, planned_at)
  where schedule_id is not null and planned_at is not null;

-- The authenticated scheduling route is allowed to attach a newly created
-- session to its schedule. Reminder state remains server-owned.
grant insert (schedule_id, plan_snapshot) on public.sessions to authenticated;
grant update (plan_snapshot) on public.sessions to authenticated;

comment on table public.push_subscriptions is
  'Account-owned Web Push subscriptions. Notification payloads must remain generic.';
comment on column public.sessions.reminder_sent_at is
  'Server-owned timestamp used to make background session reminders idempotent.';

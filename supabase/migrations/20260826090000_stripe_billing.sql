-- Stripe billing belongs to the authenticated parent account, never to a learner.
-- The table intentionally stores only Stripe identifiers and entitlement state.
create table if not exists public.billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'inactive'
    check (status in (
      'inactive', 'trialing', 'active', 'past_due', 'unpaid', 'canceled',
      'incomplete', 'incomplete_expired', 'paused'
    )),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_base_item_id text,
  stripe_extra_item_id text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.billing_accounts is
  'Server-synchronised Stripe entitlement state for a parent account. No learner data is stored here.';

create index if not exists billing_accounts_status_idx
  on public.billing_accounts (status);

alter table public.billing_accounts enable row level security;
drop policy if exists billing_accounts_select_own on public.billing_accounts;
create policy billing_accounts_select_own on public.billing_accounts
  for select using ((select auth.uid()) = user_id);

-- The client may read its own billing state, but all writes come from the verified
-- Stripe webhook through the server-side Supabase secret key.
revoke insert, update, delete on public.billing_accounts from anon, authenticated;
grant select on public.billing_accounts to authenticated;

create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

comment on table public.stripe_webhook_events is
  'Idempotency ledger for verified Stripe webhook events. Contains no customer or learner data.';

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;

# ADR 0001 — Dedicated EU Supabase project and data boundary

Status: accepted and implemented for the PoC foundation

Date: 2026-08-22

## Context

Mattis will process data about pupils, learning progress, tutor conversations,
and short-lived homework images. GDPR, data minimization, deletion, and tenant
isolation are therefore architectural requirements rather than later polish.

Two unrelated Supabase projects are visible in the connected account. Neither
is an authorized Mattis target. A dedicated project has now been provisioned.

## Decision

- Use a dedicated Mattis Supabase project in an EU region.
- The selected project is `Mattis` (`ccpyhexgpiqdmtwvzjdd`) in Stockholm
  (`eu-north-1`) under the Mentiq organization.
- Do not reuse or modify an unrelated project.
- Do not create a paid project or branch without confirming organization,
  region, and current cost with the owner.
- Keep user-owned tables in `public` only when they need the Data API. Apply
  explicit table grants plus RLS; grants and policies are separate controls.
- Revoke anonymous table access. Use publishable keys in clients and keep
  secret/service-role keys in server-only environments.
- Authenticate the closed PoC with an invited email and one-time code; keep
  session tokens in HTTP-only cookies rather than browser storage.
- Enforce same-owner relationships with composite foreign keys, not only with
  application checks or RLS.
- Use a private Storage bucket. Prefix homework object paths with `auth.uid()`.
- Store deletion deadlines for homework images, chat messages, and product
  events. Implement and verify cleanup jobs before any real-student pilot.
- Keep AI providers behind server-owned adapters. Models receive minimized
  context and never direct database access.

## Consequences

- Local schema work can proceed without live credentials.
- The project cost was confirmed as USD 0/month before provisioning.
- Hosted migration history is mirrored in `supabase/migrations/`.
- Security tests and database advisors become release gates.

## References

- Supabase Row Level Security documentation
- Supabase April 2026 Data API explicit-grant change
- Mattis PoC build specification v0.1

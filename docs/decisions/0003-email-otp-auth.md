# ADR 0003 — Invited email OTP for the closed PoC

Status: accepted and implemented

Date: 2026-08-22

## Context

The first Mattis test needs real session ownership without a full account setup
flow. Anonymous identities would make returning sessions and later deletion
requests harder to understand. The PoC remains closed to one invited tester.

## Decision

- Use Supabase passwordless email authentication with a six-digit OTP.
- Allow only addresses listed in the server-only `MATTIS_ALLOWED_EMAILS`
  variable; the initial tester is configured privately in Vercel.
- Put `{{ .Token }}` in the hosted Magic Link email template.
- Verify the OTP on a server route and store access and refresh tokens in
  secure, HTTP-only, same-site cookies.
- Use the authenticated user ID as the owner ID for the demo profile and all
  later student-owned records.
- Keep anonymous sign-in disabled.

## Consequences

- The tester can return to the same synthetic profile without managing a
  password.
- Supabase Auth is the identity boundary and the existing authenticated-owner
  RLS policies apply.
- The allowlist is only a PoC gate, not an authorization model for production.
- Custom SMTP, consent/guardian flows, account deletion, and verified retention
  jobs remain required before a real-student pilot.

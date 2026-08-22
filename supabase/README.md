# Supabase foundation

The dedicated `Mattis` project is active in Stockholm (`eu-north-1`) with
project ref `ccpyhexgpiqdmtwvzjdd`.

The reviewed consolidated schema source lives at
`../mattis-poc-spec/mattis-poc-schema.sql`. The `migrations/` directory mirrors
the two migrations recorded by the hosted project:

- `20260822064942_mattis_poc_baseline.sql`
- `20260822065059_add_covering_foreign_key_indexes.sql`

When the CLI is available, verify a clean local replay in this order:

```bash
supabase --version
supabase start
supabase db reset
supabase migration list --local
supabase db advisors
```

Do not link this repository to either unrelated project in the Mentiq account.

## Security assumptions

- All public tables have RLS and explicit authenticated-role grants.
- Anonymous access is explicitly revoked.
- Every user-owned child row has a composite foreign key that binds it to the
  same owner as its session/task/upload parent.
- Homework Storage is private and object keys start with `auth.uid()`.
- The publishable key is held in the server environment for this PoC;
  secret/service-role keys never enter browser code or the repository.
- The schema uses retention timestamps, but deletion jobs must be implemented
  and verified before any real student pilot.

## Client activation

1. Keep email authentication enabled and anonymous sign-ins disabled.
2. Install `templates/magic-link.html` as the hosted Magic Link template; the
   `{{ .Token }}` variable makes Supabase send a six-digit code.
3. Copy `.env.example` to `.env.local` and set `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, and `MATTIS_ALLOWED_EMAILS`.
4. Request the code with `POST /api/auth/request-otp`, then verify it with
   `POST /api/auth/verify-otp`. The server stores the session in HTTP-only
   cookies and creates the owner-scoped demo profile.
5. Configure custom SMTP before a wider pilot, then add CAPTCHA and stronger
   rate limits before the URL is exposed outside the closed demo.
